import userModel from '../models/userModel.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import transactionModel from '../models/transactionModel.js';
import axios from 'axios';

const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.json({ success: false, message: 'Missing Details' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const userData = { name, email, password: hashedPassword };
        const newUser = new userModel(userData);
        const user = await newUser.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

        res.json({ success: true, token, user: { name: user.name } });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await userModel.findOne({ email });
        if (!user) {
            return res.json({ success: false, message: 'User does not exist' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
            return res.json({ success: true, token, user: { name: user.name } });
        } else {
            return res.json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const userCredits = async (req, res) => {
    try {
        const user = await userModel.findById(req.user.id);
        res.json({ success: true, credits: user.creditBalance, user: { name: user.name } });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

// ✅ PAYPAL: Create Order
const paymentPaypal = async (req, res) => {
    try {
        const { planId } = req.body;
        if (!planId) {
            return res.json({ success: false, message: 'Plan ID is required' });
        }

        let credits, amount;
        switch (planId) {
            case 'Basic':
                credits = 100;
                amount = 10;
                break;
            case 'Advanced':
                credits = 500;
                amount = 50;
                break;
            case 'Business':
                credits = 5000;
                amount = 250;
                break;
            default:
                return res.json({ success: false, message: 'Invalid plan' });
        }

        // Get PayPal access token
        const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
        const tokenResponse = await axios.post(
            'https://api-m.sandbox.paypal.com/v1/oauth2/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${auth}`
                }
            }
        );
        const accessToken = tokenResponse.data.access_token;

        // Create PayPal order
        const orderResponse = await axios.post(
            'https://api-m.sandbox.paypal.com/v2/checkout/orders',
            {
                intent: 'CAPTURE',
                purchase_units: [{
                    amount: {
                        currency_code: 'USD',
                        value: amount
                    }
                }]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        const order = orderResponse.data;
        res.json({ success: true, orderId: order.id, approvalUrl: order.links.find(link => link.rel === 'approve').href });

    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

// ✅ PAYPAL: Verify Payment
const verifyPaypal = async (req, res) => {
    const { details, planId } = req.body;
    const orderId = details.id;
    const userId = req.user.id;

    try {
        // Get PayPal access token
        const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
        const tokenResponse = await axios.post(
            'https://api-m.sandbox.paypal.com/v1/oauth2/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${auth}`
                }
            }
        );
        const accessToken = tokenResponse.data.access_token;

        // Fetch PayPal order details
        const orderResponse = await axios.get(
            `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        const orderData = orderResponse.data;

        if (orderData.status === 'COMPLETED') {
            let credits, amount;
            switch (planId) {
                case 'Basic':
                    credits = 100;
                    amount = 10;
                    break;
                case 'Advanced':
                    credits = 500;
                    amount = 50;
                    break;
                case 'Business':
                    credits = 5000;
                    amount = 250;
                    break;
                default:
                    return res.json({ success: false, message: 'Invalid plan' });
            }

            // Find user
            const user = await userModel.findById(userId);
            if (!user) {
                return res.json({ success: false, message: 'User not found' });
            }

            // Create transaction record
            await transactionModel.create({
                userId,
                plan: planId,
                amount,
                credits,
                date: Date.now(),
                payment: true,
            });

            // Update user's credit balance
            const updatedCreditBalance = user.creditBalance + credits;
            await userModel.findByIdAndUpdate(userId, { creditBalance: updatedCreditBalance });

            return res.json({ success: true, message: 'Payment successful', creditBalance: updatedCreditBalance });
        } else {
            return res.json({ success: false, message: 'Payment not completed' });
        }
    } catch (error) {
        console.log(error.message);
        return res.json({ success: false, message: error.message });
    }
};

export { registerUser, loginUser, userCredits, paymentPaypal, verifyPaypal };
