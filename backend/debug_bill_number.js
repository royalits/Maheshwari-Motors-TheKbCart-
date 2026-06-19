import 'dotenv/config.js';
import mongoose from 'mongoose';
import Bill from './src/models/transaction/bill.model.js';

async function debugBillNumbering() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('\n=== DEBUGGING BILL FETCH FOR EACH CONTACT TYPE ===\n');

    // Get first user
    const bills = await Bill.find({}).select('user_id').limit(1);
    if (!bills.length) {
      console.log('No bills found');
      process.exit(0);
    }

    const userId = bills[0].user_id;
    console.log(`Using user_id: ${userId}\n`);

    // Test the exact aggregation for each contact type
    for (const type of ['party', 'supplier', 'book']) {
      console.log(`Testing ${type.toUpperCase()}:`);
      
      const result = await Bill.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(String(userId)),
            is_gst: 1,
            bill_no: { $regex: /^\d+$/ },
          },
        },
        {
          $lookup: {
            from: 'contacts',
            let: { contactId: '$contact_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$_id', '$$contactId'] },
                  type: type,
                },
              },
            ],
            as: 'contact_info',
          },
        },
        {
          $match: {
            contact_info: { $ne: [] },
          },
        },
        {
          $project: {
            bill_no: 1,
            serial: { $toInt: '$bill_no' },
          },
        },
        {
          $sort: { serial: 1 },
        },
      ]);

      console.log(`  Bills found: ${result.length}`);
      result.forEach(b => console.log(`    - ${b.bill_no}`));
      
      const [maxRow] = await Bill.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(String(userId)),
            is_gst: 1,
            bill_no: { $regex: /^\d+$/ },
          },
        },
        {
          $lookup: {
            from: 'contacts',
            let: { contactId: '$contact_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$_id', '$$contactId'] },
                  type: type,
                },
              },
            ],
            as: 'contact_info',
          },
        },
        {
          $match: {
            contact_info: { $ne: [] },
          },
        },
        {
          $project: {
            serial: { $toInt: '$bill_no' },
          },
        },
        {
          $group: {
            _id: null,
            max_serial: { $max: '$serial' },
          },
        },
      ]);

      const maxSerial = maxRow?.max_serial || 0;
      const nextSerial = maxSerial + 1;
      const nextBillNo = String(nextSerial).padStart(6, '0');
      
      console.log(`  Max serial: ${maxSerial}`);
      console.log(`  Next bill number: ${nextBillNo}\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

debugBillNumbering();
