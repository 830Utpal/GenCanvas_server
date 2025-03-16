import express from 'express';
import { 
  registerUser, 
  loginUser, 
  userCredits, 
  paymentPaypal,  // Function to initiate PayPal payment
  verifyPaypal    // Function to verify PayPal payment
} from "../controllers/userController.js";
import userAuth from '../middlewares/auth.js';

const userRouter = express.Router();

userRouter.post('/register', registerUser);
userRouter.post('/login', loginUser);
userRouter.get('/credits', userAuth, userCredits);
userRouter.post('/pay-paypal', userAuth, paymentPaypal);  // Initiate PayPal payment
userRouter.post('/verify-paypal', verifyPaypal); // Verify PayPal payment

export default userRouter;
