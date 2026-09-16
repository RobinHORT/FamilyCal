import 'dotenv/config';
import { db } from './server/db.js';
import { generateToken } from './server/auth.js';
import express from 'express';
import { router as apiRouter } from './server/routes/api.js';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

// Real Date preservation and Mocking helper
const RealDate = global.Date;
let mockedDateString: string | null = null;

class MockedDate extends RealDate {
  constructor(...args: any[]) {
    if (args.length === 0 && mockedDateString) {
      super(mockedDateString);
    } else {
      super(...(args as [any]));
    }
  }

  static now() {
    if (mockedDateString) {
      return new RealDate(mockedDateString).getTime();
    }
    return RealDate.now();
  }
}

function mockSystemDate(dateStr: string) {
  mockedDateString = dateStr;
  global.Date = MockedDate as any;
}

function restoreSystemDate() {
  mockedDateString = null;
  global.Date = RealDate;
}

// Initialize Express App under test
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', apiRouter);

// Database Test Seeding and Cleanup Helpers
const TEST_FAMILY_ID = 'test-fam-stock-' + uuidv4().slice(0, 8);
const TEST_ADMIN_USER_ID = 'test-usr-admin-stock-' + uuidv4().slice(0, 8);
const TEST_ADMIN_MEMBER_ID = 'test-mem-admin-stock-' + uuidv4().slice(0, 8);

let adminToken: string;

function seedTestData() {
  const now = new Date().toISOString();
  
  // 1. Create family
  db.prepare(`
    INSERT INTO families (id, name, timezone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(TEST_FAMILY_ID, 'Stock Test Family', 'UTC', now, now);

  // 2. Create user
  db.prepare(`
    INSERT INTO users (id, family_id, email, username, password_hash, name, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(TEST_ADMIN_USER_ID, TEST_FAMILY_ID, 'admin-stock@test.com', 'testadminstock', 'hashed_pass', 'Admin Member', 'administrator', now, now);

  // 3. Create family member
  db.prepare(`
    INSERT INTO family_members (id, family_id, user_id, name, role, points, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(TEST_ADMIN_MEMBER_ID, TEST_FAMILY_ID, TEST_ADMIN_USER_ID, 'Admin Member', 'administrator', now);

  // Generate Auth Tokens
  adminToken = generateToken({ id: TEST_ADMIN_USER_ID, family_id: TEST_FAMILY_ID, name: 'Admin Member', role: 'administrator' });
}

function cleanupTestData() {
  // Clean up stock data for test family
  db.prepare('DELETE FROM shopping_list_items WHERE family_id = ?').run(TEST_FAMILY_ID);
  db.prepare('DELETE FROM stock_logs WHERE family_id = ?').run(TEST_FAMILY_ID);
  db.prepare('DELETE FROM stock_barcodes WHERE family_id = ?').run(TEST_FAMILY_ID);
  db.prepare('DELETE FROM stock_items WHERE family_id = ?').run(TEST_FAMILY_ID);
  db.prepare('DELETE FROM family_members WHERE family_id = ?').run(TEST_FAMILY_ID);
  db.prepare('DELETE FROM users WHERE family_id = ?').run(TEST_FAMILY_ID);
  db.prepare('DELETE FROM families WHERE id = ?').run(TEST_FAMILY_ID);
}

// Global results aggregator
interface TestResult {
  num: number;
  description: string;
  expected: string;
  actual: string;
  result: 'PASS' | 'FAIL';
}
const testResults: TestResult[] = [];

function recordTest(num: number, description: string, expected: string, actual: string, result: 'PASS' | 'FAIL') {
  testResults.push({ num, description, expected, actual, result });
  const statusStr = result === 'PASS' ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`${statusStr} ${num}. ${description}`);
  console.log(`     Expected: ${expected}`);
  console.log(`     Actual:   ${actual}\n`);
}

async function runStockTests() {
  console.log('================================================================');
  console.log('                   STARTING STOCK SYSTEM TESTS                 ');
  console.log('================================================================\n');

  try {
    seedTestData();

    // Setup base date for test repeatability
    mockSystemDate('2026-09-16T12:00:00.000Z');

    // -------------------------------------------------------------
    // TEST 1: Create Stock Item (Basic creation)
    // -------------------------------------------------------------
    const createRes1 = await request(app)
      .post('/api/stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Whole Milk',
        category: 'Dairy',
        quantity: 3,
        unit: 'bottles',
        low_stock_threshold: 1,
        target_stock: 4,
        shopping_trigger: 'low_stock',
        is_favorite: 1,
        location: 'Fridge',
        notes: 'Organic milk only',
      });

    const milkItem = createRes1.body;
    const initialMilkId = milkItem?.id;

    if (createRes1.status === 201 && initialMilkId && milkItem.name === 'Whole Milk') {
      recordTest(
        1,
        'Create Stock Item (Whole Milk)',
        'Status 201 with milk item payload',
        `Status ${createRes1.status}, ID: ${initialMilkId}, Name: ${milkItem.name}`,
        'PASS'
      );
    } else {
      recordTest(
        1,
        'Create Stock Item (Whole Milk)',
        'Status 201 with milk item payload',
        `Status ${createRes1.status}, Payload: ${JSON.stringify(createRes1.body)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 2: Verify No Shopping List Item Created (Since Quantity 3 > Low stock threshold 1)
    // -------------------------------------------------------------
    const getShopRes2 = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    
    const milkShoppingItems2 = getShopRes2.body.filter((i: any) => i.stock_item_id === initialMilkId || i.name === 'Whole Milk');

    if (milkShoppingItems2.length === 0) {
      recordTest(
        2,
        'Replenishment Trigger: No shopping list entry when qty > threshold',
        '0 milk items in shopping list',
        `Found ${milkShoppingItems2.length} items in shopping list`,
        'PASS'
      );
    } else {
      recordTest(
        2,
        'Replenishment Trigger: No shopping list entry when qty > threshold',
        '0 milk items in shopping list',
        `Found: ${JSON.stringify(milkShoppingItems2)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 3: Adjust stock quantity down to low stock (From 3 to 1)
    // -------------------------------------------------------------
    const adjustRes3 = await request(app)
      .post(`/api/stock/${initialMilkId}/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'use',
        amount: 2,
      });

    const updatedMilk3 = adjustRes3.body;

    if (adjustRes3.status === 200 && updatedMilk3?.quantity === 1) {
      recordTest(
        3,
        'Adjust Quantity: Use 2 bottles of Whole Milk (Qty 3 -> 1)',
        'Status 200 with new quantity of 1',
        `Status ${adjustRes3.status}, Quantity: ${updatedMilk3?.quantity}`,
        'PASS'
      );
    } else {
      recordTest(
        3,
        'Adjust Quantity: Use 2 bottles of Whole Milk (Qty 3 -> 1)',
        'Status 200 with new quantity of 1',
        `Status ${adjustRes3.status}, Payload: ${JSON.stringify(adjustRes3.body)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 4: Verify Shopping List Item Added Automatically (Since Qty 1 <= threshold 1)
    // -------------------------------------------------------------
    const getShopRes4 = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    
    const milkShoppingItems4 = getShopRes4.body.filter((i: any) => i.stock_item_id === initialMilkId);

    if (milkShoppingItems4.length === 1 && milkShoppingItems4[0].quantity === 3) {
      // 4 (target_stock) - 1 (quantity) = 3 needed
      const item = milkShoppingItems4[0];
      recordTest(
        4,
        'Replenishment Trigger: Auto replenishment item added for low stock',
        '1 milk item in shopping list with needed quantity 3',
        `Found ${milkShoppingItems4.length} item(s), Quantity: ${item.quantity}, Notes: "${item.notes}"`,
        'PASS'
      );
    } else {
      recordTest(
        4,
        'Replenishment Trigger: Auto replenishment item added for low stock',
        '1 milk item in shopping list with needed quantity 3',
        `Found: ${JSON.stringify(milkShoppingItems4)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 5: Verify Re-Evaluating Triggers Does NOT Duplicate the Shopping Item
    // -------------------------------------------------------------
    // We fetch shopping list again, triggering evaluateStockShoppingTriggers internally
    const getShopRes5 = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    
    const milkShoppingItems5 = getShopRes5.body.filter((i: any) => i.stock_item_id === initialMilkId);

    if (milkShoppingItems5.length === 1 && milkShoppingItems5[0].quantity === 3) {
      recordTest(
        5,
        'Replenishment Robustness: evaluateStockShoppingTriggers does not duplicate active item',
        'Exactly 1 active milk item remains',
        `Found ${milkShoppingItems5.length} item(s) in shopping list`,
        'PASS'
      );
    } else {
      recordTest(
        5,
        'Replenishment Robustness: evaluateStockShoppingTriggers does not duplicate active item',
        'Exactly 1 active milk item remains',
        `Found: ${JSON.stringify(milkShoppingItems5)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 6: Adjust stock quantity down to 0
    // -------------------------------------------------------------
    const adjustRes6 = await request(app)
      .post(`/api/stock/${initialMilkId}/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'use',
        amount: 1,
      });

    const updatedMilk6 = adjustRes6.body;

    if (adjustRes6.status === 200 && updatedMilk6?.quantity === 0) {
      recordTest(
        6,
        'Adjust Quantity: Use 1 more bottle of Whole Milk (Qty 1 -> 0)',
        'Status 200 with new quantity of 0',
        `Status ${adjustRes6.status}, Quantity: ${updatedMilk6?.quantity}`,
        'PASS'
      );
    } else {
      recordTest(
        6,
        'Adjust Quantity: Use 1 more bottle of Whole Milk (Qty 1 -> 0)',
        'Status 200 with new quantity of 0',
        `Status ${adjustRes6.status}, Payload: ${JSON.stringify(adjustRes6.body)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 7: Verify Shopping List Item Updated to needed quantity of 4
    // -------------------------------------------------------------
    const getShopRes7 = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    
    const milkShoppingItems7 = getShopRes7.body.filter((i: any) => i.stock_item_id === initialMilkId);

    if (milkShoppingItems7.length === 1 && milkShoppingItems7[0].quantity === 4) {
      // 4 (target_stock) - 0 (quantity) = 4 needed
      const item = milkShoppingItems7[0];
      recordTest(
        7,
        'Replenishment Sync: Shopping list item quantity updated dynamically',
        'Milk item updated to quantity 4',
        `Found ${milkShoppingItems7.length} item(s), Quantity: ${item.quantity}, Notes: "${item.notes}"`,
        'PASS'
      );
    } else {
      recordTest(
        7,
        'Replenishment Sync: Shopping list item quantity updated dynamically',
        'Milk item updated to quantity 4',
        `Found: ${JSON.stringify(milkShoppingItems7)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 8: Restock Milk (Add 4 bottles) and verify Shopping Item gets automatically deleted
    // -------------------------------------------------------------
    const adjustRes8 = await request(app)
      .post(`/api/stock/${initialMilkId}/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'add',
        amount: 4,
      });

    const getShopRes8 = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    
    const milkShoppingItems8 = getShopRes8.body.filter((i: any) => i.stock_item_id === initialMilkId);

    if (adjustRes8.status === 200 && adjustRes8.body.quantity === 4 && milkShoppingItems8.length === 0) {
      recordTest(
        8,
        'Replenishment Resolution: Auto-generated item deleted after restocking',
        'Milk quantity 4, 0 milk items in shopping list',
        `Quantity: ${adjustRes8.body.quantity}, Shopping entries: ${milkShoppingItems8.length}`,
        'PASS'
      );
    } else {
      recordTest(
        8,
        'Replenishment Resolution: Auto-generated item deleted after restocking',
        'Milk quantity 4, 0 milk items in shopping list',
        `Quantity: ${adjustRes8.body?.quantity}, Shopping entries: ${JSON.stringify(milkShoppingItems8)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 9: TriggerMode "zero_stock" validation
    // -------------------------------------------------------------
    // Create new item with zero_stock trigger
    const createRes9 = await request(app)
      .post('/api/stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Eggs',
        category: 'Dairy',
        quantity: 1,
        unit: 'cartons',
        low_stock_threshold: 1,
        target_stock: 3,
        shopping_trigger: 'zero_stock',
      });

    const eggItem = createRes9.body;
    const eggId = eggItem?.id;

    // Verify no shopping item created yet (quantity is 1, which is > 0)
    const getShopRes9a = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    const eggShop9a = getShopRes9a.body.filter((i: any) => i.stock_item_id === eggId);

    // Adjust Eggs down to 0
    await request(app)
      .post(`/api/stock/${eggId}/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'use',
        amount: 1,
      });

    // Verify shopping item is now added
    const getShopRes9b = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    const eggShop9b = getShopRes9b.body.filter((i: any) => i.stock_item_id === eggId);

    if (eggShop9a.length === 0 && eggShop9b.length === 1 && eggShop9b[0].quantity === 3) {
      recordTest(
        9,
        'TriggerMode "zero_stock": Only triggers shopping list when stock is completely 0',
        'No item at qty 1, but added at qty 0 with qty 3',
        `At qty 1: ${eggShop9a.length} items. At qty 0: ${eggShop9b.length} item with quantity ${eggShop9b[0]?.quantity}. Notes: "${eggShop9b[0]?.notes}"`,
        'PASS'
      );
    } else {
      recordTest(
        9,
        'TriggerMode "zero_stock": Only triggers shopping list when stock is completely 0',
        'No item at qty 1, but added at qty 0 with qty 3',
        `At qty 1: ${eggShop9a.length} items. At qty 0: ${eggShop9b.length} items. Payload: ${JSON.stringify(eggShop9b)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 10: TriggerMode "before_expiry" validation
    // -------------------------------------------------------------
    // Create new item with before_expiry trigger
    const createRes10 = await request(app)
      .post('/api/stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Avocado',
        category: 'Produce',
        quantity: 5,
        unit: 'pieces',
        target_stock: 5,
        shopping_trigger: 'before_expiry',
        expiry_days_threshold: 3,
      });

    const avoItem = createRes10.body;
    const avoId = avoItem?.id;

    // Verify no shopping item initially
    const getShopRes10a = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    const avoShop10a = getShopRes10a.body.filter((i: any) => i.stock_item_id === avoId);

    // Now, let's open an Avocado batch that is expiring in 2 days (which is <= expiry_days_threshold 3)
    // Today is mocked to September 16, so expiry is September 18
    const adjustRes10 = await request(app)
      .post(`/api/stock/${avoId}/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'open',
        amount: 2,
        expiry_date: '2026-09-18',
      });

    // Check shopping list again
    const getShopRes10b = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    const avoShop10b = getShopRes10b.body.filter((i: any) => i.stock_item_id === avoId);

    if (avoShop10a.length === 0 && avoShop10b.length === 1 && avoShop10b[0].quantity === 2) {
      recordTest(
        10,
        'TriggerMode "before_expiry": Triggers shopping list if an opened batch is expiring soon',
        'No item initially, but added after opening expiring batch with quantity 2',
        `Initial: ${avoShop10a.length}. After open expiring batch: ${avoShop10b.length} item with quantity ${avoShop10b[0].quantity}. Notes: "${avoShop10b[0].notes}"`,
        'PASS'
      );
    } else {
      recordTest(
        10,
        'TriggerMode "before_expiry": Triggers shopping list if an opened batch is expiring soon',
        'No item initially, but added after opening expiring batch with quantity 2',
        `Initial: ${avoShop10a.length}. After open expiring batch: ${avoShop10b.length} items. Payload: ${JSON.stringify(avoShop10b)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 11: TriggerMode "none" validation
    // -------------------------------------------------------------
    // Create new item with "none" trigger
    const createRes11 = await request(app)
      .post('/api/stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Soda Can',
        category: 'Beverages',
        quantity: 0,
        unit: 'cans',
        low_stock_threshold: 2,
        target_stock: 6,
        shopping_trigger: 'none',
      });

    const sodaItem = createRes11.body;
    const sodaId = sodaItem?.id;

    // Verify no shopping item created
    const getShopRes11 = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    const sodaShop11 = getShopRes11.body.filter((i: any) => i.stock_item_id === sodaId);

    if (sodaShop11.length === 0) {
      recordTest(
        11,
        'TriggerMode "none": No automatic shopping list additions occur',
        '0 soda items in shopping list',
        `Found ${sodaShop11.length} items in shopping list`,
        'PASS'
      );
    } else {
      recordTest(
        11,
        'TriggerMode "none": No automatic shopping list additions occur',
        '0 soda items in shopping list',
        `Found: ${JSON.stringify(sodaShop11)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 12: TriggerMode change dynamically deletes/creates active item
    // -------------------------------------------------------------
    // Change triggerMode of Soda Can from 'none' to 'low_stock'
    const updateRes12 = await request(app)
      .put(`/api/stock/${sodaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        shopping_trigger: 'low_stock',
      });

    // Check shopping list again
    const getShopRes12 = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    const sodaShop12 = getShopRes12.body.filter((i: any) => i.stock_item_id === sodaId);

    if (updateRes12.status === 200 && sodaShop12.length === 1 && sodaShop12[0].quantity === 6) {
      recordTest(
        12,
        'Dynamic Trigger Update: Changing trigger to low_stock immediately evaluates and creates shopping item',
        '1 soda item with quantity 6 in shopping list',
        `Found ${sodaShop12.length} item(s) with quantity ${sodaShop12[0]?.quantity}`,
        'PASS'
      );
    } else {
      recordTest(
        12,
        'Dynamic Trigger Update: Changing trigger to low_stock immediately evaluates and creates shopping item',
        '1 soda item with quantity 6 in shopping list',
        `Status ${updateRes12.status}, Shopping list: ${JSON.stringify(sodaShop12)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 13: Dynamic Trigger Update (back to none)
    // -------------------------------------------------------------
    // Change triggerMode of Soda Can back to 'none'
    const updateRes13 = await request(app)
      .put(`/api/stock/${sodaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        shopping_trigger: 'none',
      });

    // Check shopping list again
    const getShopRes13 = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    const sodaShop13 = getShopRes13.body.filter((i: any) => i.stock_item_id === sodaId);

    if (updateRes13.status === 200 && sodaShop13.length === 0) {
      recordTest(
        13,
        'Dynamic Trigger Update: Changing trigger back to "none" immediately deletes active auto-generated item',
        '0 soda items in shopping list',
        `Found ${sodaShop13.length} items in shopping list`,
        'PASS'
      );
    } else {
      recordTest(
        13,
        'Dynamic Trigger Update: Changing trigger back to "none" immediately deletes active auto-generated item',
        '0 soda items in shopping list',
        `Found: ${JSON.stringify(sodaShop13)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 14: Barcode Association and Lookup
    // -------------------------------------------------------------
    // Link barcode "1234567890" to Whole Milk
    const barcodeRes14 = await request(app)
      .post(`/api/stock/${initialMilkId}/barcodes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        barcode: '1234567890',
        brand_or_label: 'Organic Valley Whole Milk',
        quantity_delta_per_scan: 2,
      });

    // Lookup stock item by barcode
    const lookupRes14 = await request(app)
      .get('/api/stock/barcode/1234567890')
      .set('Authorization', `Bearer ${adminToken}`);

    if (barcodeRes14.status === 200 && lookupRes14.status === 200 && lookupRes14.body.found && lookupRes14.body.stockItem?.id === initialMilkId) {
      recordTest(
        14,
        'Barcode Mapping: Associate barcode with stock item and successfully lookup',
        'Barcode maps successfully to Whole Milk',
        `Associate status: ${barcodeRes14.status}, Lookup found: ${lookupRes14.body.found}, Item ID: ${lookupRes14.body.stockItem?.id}`,
        'PASS'
      );
    } else {
      recordTest(
        14,
        'Barcode Mapping: Associate barcode with stock item and successfully lookup',
        'Barcode maps successfully to Whole Milk',
        `Associate status: ${barcodeRes14.status}, Lookup body: ${JSON.stringify(lookupRes14.body)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 15: Execute Barcode Scan Action (Add Stock via barcode scan)
    // -------------------------------------------------------------
    // Initial Whole Milk quantity is 4 (from RESTOCK in Test 8)
    // Scan "1234567890" using scan action 'add' (which should add 2 bottles based on quantity_delta_per_scan)
    const scanRes15 = await request(app)
      .post('/api/stock/scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        barcode: '1234567890',
        action: 'add',
      });

    const updatedQtyMilk = scanRes15.body.stockItem?.quantity;

    if (scanRes15.status === 200 && updatedQtyMilk === 6) {
      recordTest(
        15,
        'Barcode Scan Action: Scanning barcode increments stock by correct quantity_delta_per_scan',
        'Whole Milk quantity increments from 4 to 6',
        `Status ${scanRes15.status}, New Milk Quantity: ${updatedQtyMilk}`,
        'PASS'
      );
    } else {
      recordTest(
        15,
        'Barcode Scan Action: Scanning barcode increments stock by correct quantity_delta_per_scan',
        'Whole Milk quantity increments from 4 to 6',
        `Status ${scanRes15.status}, Body: ${JSON.stringify(scanRes15.body)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 16: Delete Barcode mapping
    // -------------------------------------------------------------
    // Find barcode ID
    const milkItemWithBarcodes = scanRes15.body.stockItem;
    const barcodeId = milkItemWithBarcodes.barcodes?.[0]?.id;

    let deleteBarcodeStatus = 404;
    if (barcodeId) {
      const deleteBarcodeRes = await request(app)
        .delete(`/api/stock/barcodes/${barcodeId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      deleteBarcodeStatus = deleteBarcodeRes.status;
    }

    // Attempt lookup again
    const lookupRes16 = await request(app)
      .get('/api/stock/barcode/1234567890')
      .set('Authorization', `Bearer ${adminToken}`);

    if (deleteBarcodeStatus === 200 && lookupRes16.status === 200 && !lookupRes16.body.found) {
      recordTest(
        16,
        'Barcode Removal: Delete barcode mapping and ensure it no longer resolves',
        'Delete returns 200 and lookup returns found: false',
        `Delete status: ${deleteBarcodeStatus}, Lookup found: ${lookupRes16.body.found}`,
        'PASS'
      );
    } else {
      recordTest(
        16,
        'Barcode Removal: Delete barcode mapping and ensure it no longer resolves',
        'Delete returns 200 and lookup returns found: false',
        `Delete status: ${deleteBarcodeStatus}, Lookup: ${JSON.stringify(lookupRes16.body)}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 17: Delete Stock Item and verify cascade deletion of barcodes & auto-shopping list
    // -------------------------------------------------------------
    // Create temporary item, make it low stock so it triggers a shopping list entry, then delete it.
    const createRes17 = await request(app)
      .post('/api/stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Delete Me Item',
        category: 'Pantry Essentials',
        quantity: 0,
        unit: 'packs',
        low_stock_threshold: 1,
        target_stock: 2,
        shopping_trigger: 'low_stock',
      });

    const delId = createRes17.body.id;

    // Check shopping list contains it
    const shopRes17a = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    const hasShop17a = shopRes17a.body.some((i: any) => i.stock_item_id === delId);

    // Delete item
    const deleteRes17 = await request(app)
      .delete(`/api/stock/${delId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Check shopping list again
    const shopRes17b = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    const hasShop17b = shopRes17b.body.some((i: any) => i.stock_item_id === delId);

    if (deleteRes17.status === 200 && hasShop17a && !hasShop17b) {
      recordTest(
        17,
        'Stock Item Deletion: Deleting stock item cascades and removes its auto-generated shopping entry',
        'Item deleted, initially in shopping list, but completely gone after deletion',
        `Delete status: ${deleteRes17.status}, In shopping initially: ${hasShop17a}, After deletion: ${hasShop17b}`,
        'PASS'
      );
    } else {
      recordTest(
        17,
        'Stock Item Deletion: Deleting stock item cascades and removes its auto-generated shopping entry',
        'Item deleted, initially in shopping list, but completely gone after deletion',
        `Delete status: ${deleteRes17.status}, Initial: ${hasShop17a}, Final: ${hasShop17b}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 18: Ticked/Checked Shopping Items replenishment logic
    // -------------------------------------------------------------
    // Egg quantity is 0 (from Test 9), and has target_stock = 3.
    // It currently has an active auto-generated shopping entry of quantity 3 (target 3 - quantity 0).
    // Let's toggle/complete the egg shopping item to simulate "checking it off" as purchased.
    const shopRes18 = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    const eggShopItem = shopRes18.body.find((i: any) => i.stock_item_id === eggId);

    let toggleStatus = 404;
    let tickedEggInList = false;

    if (eggShopItem) {
      const toggleRes = await request(app)
        .post(`/api/shopping-list/${eggShopItem.id}/toggle`)
        .set('Authorization', `Bearer ${adminToken}`);
      toggleStatus = toggleRes.status;

      // Verify it's still in the shopping list but is now completed/ticked
      const shopListAfterToggle = await request(app)
        .get('/api/shopping-list')
        .set('Authorization', `Bearer ${adminToken}`);
      const updatedEggItem = shopListAfterToggle.body.find((i: any) => i.id === eggShopItem.id);
      tickedEggInList = updatedEggItem?.is_completed === true;
    }

    if (toggleStatus === 200 && tickedEggInList) {
      recordTest(
        18,
        'Shopping Toggle: Completed/Ticked shopping list item represents purchased/checked-off state',
        'Toggle status 200, item marked as completed',
        `Toggle status: ${toggleStatus}, is_completed: ${tickedEggInList}`,
        'PASS'
      );
    } else {
      recordTest(
        18,
        'Shopping Toggle: Completed/Ticked shopping list item represents purchased/checked-off state',
        'Toggle status 200, item marked as completed',
        `Toggle status: ${toggleStatus}, is_completed: ${tickedEggInList}`,
        'FAIL'
      );
    }

    // -------------------------------------------------------------
    // TEST 19: Clear Completed Shopping List
    // -------------------------------------------------------------
    // Delete completed shopping items using clear completed
    const clearRes = await request(app)
      .post('/api/shopping-list/clear-completed')
      .set('Authorization', `Bearer ${adminToken}`);

    const shopListAfterClear = await request(app)
      .get('/api/shopping-list')
      .set('Authorization', `Bearer ${adminToken}`);
    const completedEggShopItemGone = !shopListAfterClear.body.some((i: any) => i.stock_item_id === eggId && i.is_completed === true);

    if (clearRes.status === 200 && completedEggShopItemGone) {
      recordTest(
        19,
        'Shopping Clear: Clear completed shopping items works correctly',
        'Clear returns 200 and completed items are removed',
        `Clear status: ${clearRes.status}, Completed egg item is gone: ${completedEggShopItemGone}`,
        'PASS'
      );
    } else {
      recordTest(
        19,
        'Shopping Clear: Clear completed shopping items works correctly',
        'Clear returns 200 and completed items are removed',
        `Clear status: ${clearRes.status}, Completed egg item gone: ${completedEggShopItemGone}`,
        'FAIL'
      );
    }

  } catch (error: any) {
    console.error('Fatal error encountered during stock tests:', error);
  } finally {
    restoreSystemDate();
    cleanupTestData();
    console.log('Testing and database cleanup completed.\n');
  }

  // Final summary reporting
  console.log('================================================================');
  console.log('                     STOCK SYSTEM TEST REPORT                   ');
  console.log('================================================================');
  const passedCount = testResults.filter(r => r.result === 'PASS').length;
  const failedCount = testResults.filter(r => r.result === 'FAIL').length;
  console.log(`- Overall result: ${failedCount === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}`);
  console.log(`- Tests run: ${testResults.length}`);
  console.log(`- Passed: ${passedCount}`);
  console.log(`- Failed: ${failedCount}`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStockTests();
