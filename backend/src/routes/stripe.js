const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const supabase = require('../config/supabase');

const router = express.Router();

const PRICE_TO_PLAN = {
  [process.env.STRIPE_BASIC_PRICE_ID]: 'basic',
  [process.env.STRIPE_PREMIUM_PRICE_ID]: 'premium',
};

router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const priceId = sub.items.data[0]?.price?.id;
        const plan = PRICE_TO_PLAN[priceId] || 'free';
        const status = sub.status;

        const activePlan = ['active', 'trialing'].includes(status) ? plan : 'free';

        await supabase
          .from('users')
          .update({ plan: activePlan, stripe_subscription_id: sub.id, subscription_status: status })
          .eq('stripe_customer_id', sub.customer);

        console.log(`Plan updated to "${activePlan}" for customer ${sub.customer}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await supabase
          .from('users')
          .update({ plan: 'free', stripe_subscription_id: null, subscription_status: 'canceled' })
          .eq('stripe_customer_id', sub.customer);

        console.log(`Subscription canceled — reverted to free for ${sub.customer}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.warn(`Payment failed for customer ${invoice.customer}`);
        // Optionally email the user here
        break;
      }

      default:
        // Unhandled event type — ignore
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ error: 'Webhook processing failed.' });
  }
});

module.exports = router;
