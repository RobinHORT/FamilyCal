import fetch from 'node-fetch';
import { db } from './server/db.js';

async function main() {
  console.log('--- Authenticating with the real application ---');
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@yimly.local',
      password: 'yimly123'
    })
  });

  const loginData = await loginRes.json() as any;
  if (!loginRes.ok) {
    console.error('Failed to log in:', loginData);
    process.exit(1);
  }

  const token = loginData.token;
  const user = loginData.user;
  console.log(`Logged in successfully as ${user.username} (${user.role}). Family ID: ${loginData.family.id}`);

  // Create a clean test task due on Sep 17 (tomorrow relative to NY date Sep 16)
  const taskTitle = `Future Open Task ${Date.now()}`;
  const dueDate = '2026-09-17'; // Future date

  console.log(`\n--- Creating open task "${taskTitle}" due on ${dueDate} ---`);
  const createRes = await fetch('http://localhost:3000/api/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      title: taskTitle,
      description: 'A test future task',
      due_date: dueDate,
      assignment_mode: 'open',
      priority: 'medium',
      points: 10
    })
  });

  const createData = await createRes.json() as any;
  if (!createRes.ok) {
    console.error('Failed to create task:', createData);
    process.exit(1);
  }

  const createdTask = createData.created_tasks ? createData.created_tasks[0] : createData;
  const taskId = createdTask.id;
  console.log(`Task created with ID: ${taskId}, Due Date: ${createdTask.due_date}`);

  // Inspect actual family timezone
  const family = db.prepare('SELECT timezone FROM families WHERE id = ?').get(user.family_id) as any;
  console.log(`Family timezone in DB: ${family?.timezone}`);

  // Attempt to claim the task using Sep 16 as client date
  console.log(`\n--- Attempting to claim future task ${taskId} (due ${dueDate}) ---`);
  const claimRes = await fetch(`http://localhost:3000/api/tasks/${taskId}/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      occurrence_date: dueDate,
      client_date: '2026-09-16' // Today in NY is Sep 16
    })
  });

  const claimData = await claimRes.json();
  console.log(`Claim API Response Status: ${claimRes.status}`);
  console.log('Claim API Response Body:', claimData);

  // Check the database state
  const dbTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
  console.log('\n--- Resulting Database State ---');
  console.log({
    id: dbTask.id,
    title: dbTask.title,
    due_date: dbTask.due_date,
    assigned_member_id: dbTask.assigned_member_id,
    claimed_at: dbTask.claimed_at,
    claimed_by: dbTask.claimed_by
  });
}

main().catch(console.error);
