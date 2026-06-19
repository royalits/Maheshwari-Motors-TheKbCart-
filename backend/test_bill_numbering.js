import 'dotenv/config.js';
import mongoose from 'mongoose';
import Bill from './src/models/transaction/bill.model.js';
import Contact from './src/models/master/contact.model.js';

async function testBillNumbering() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('\n=== TESTING BILL NUMBERING BY CONTACT TYPE ===\n');

    // Get all bills with their contacts
    const bills = await Bill.aggregate([
      {
        $lookup: {
          from: 'contacts',
          localField: 'contact_id',
          foreignField: '_id',
          as: 'contact_info'
        }
      },
      {
        $unwind: { path: '$contact_info', preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          bill_no: 1,
          'contact_info.name': 1,
          'contact_info.type': 1
        }
      },
      {
        $sort: { bill_no: 1 }
      }
    ]);

    console.log('All bills created:');
    bills.forEach(bill => {
      const contactType = bill.contact_info?.type || 'unknown';
      console.log(`  Bill #${bill.bill_no} - Contact: ${bill.contact_info?.name || 'N/A'} (${contactType})`);
    });

    // Group bills by contact type
    console.log('\n=== BILLS GROUPED BY CONTACT TYPE ===\n');
    const billsByType = {};
    bills.forEach(bill => {
      const type = bill.contact_info?.type || 'unknown';
      if (!billsByType[type]) billsByType[type] = [];
      billsByType[type].push(bill.bill_no);
    });

    Object.entries(billsByType).forEach(([type, billNos]) => {
      console.log(`${type.toUpperCase()}: ${billNos.join(', ')}`);
    });

    // Test fetching next bill number for each type
    console.log('\n=== TESTING _getMaxExistingBillSerial QUERY ===\n');
    
    const userId = bills[0]?.user_id || (await Contact.findOne({}).select('user_id')).user_id;
    if (!userId) {
      console.log('No user found in database');
      process.exit(0);
    }

    for (const type of ['party', 'supplier', 'book']) {
      const [row] = await Bill.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(String(userId)),
            is_gst: 1,
            bill_no: { $regex: /^\d+$/ }
          }
        },
        {
          $lookup: {
            from: 'contacts',
            let: { contactId: '$contact_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$_id', '$$contactId'] },
                  type: type
                }
              }
            ],
            as: 'contact_info'
          }
        },
        {
          $match: {
            contact_info: { $ne: [] }
          }
        },
        {
          $project: {
            serial: { $toInt: '$bill_no' }
          }
        },
        {
          $group: {
            _id: null,
            max_serial: { $max: '$serial' }
          }
        }
      ]);

      const maxSerial = row?.max_serial || 0;
      const nextSerial = maxSerial + 1;
      const nextBillNo = String(nextSerial).padStart(6, '0');
      
      console.log(`${type.toUpperCase()}: Max serial = ${maxSerial}, Next would be = ${nextBillNo}`);
    }

    console.log('\n=== TEST COMPLETE ===\n');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testBillNumbering();
