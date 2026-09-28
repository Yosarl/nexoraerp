import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { getProductCustomerHistory } from '../services/salesService';
import { LedgerAccount } from '../models/LedgerAccount';
import { Product } from '../models/Product';
import { config } from '../config';

async function testHistory(): Promise<void> {
  try {
    await mongoose.connect(config.mongodbUri);
  } catch (err) {
    console.error('Could not connect to MongoDB:', (err as Error).message);
    process.exit(1);
  }

  const customer = await LedgerAccount.findOne({ name: /yoosaf/i });
  const product = await Product.findOne({ name: /Almarai Milk/i });

  if (customer && product) {
    const companyId = customer.companyId.toString();
    const productId = product._id.toString();
    const customerId = customer._id.toString();

    console.log('Parameters:', { companyId, productId, customerId });

    try {
      const history = await getProductCustomerHistory(companyId, productId, customerId);
      console.log('Resulting history:', history);
    } catch (e: any) {
      console.error('Error running getProductCustomerHistory:', e.message);
    }
  } else {
    console.log('Customer or product not found');
  }

  await mongoose.disconnect();
  process.exit(0);
}

testHistory().catch((err) => {
  console.error(err);
  process.exit(1);
});
