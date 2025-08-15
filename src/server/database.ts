import { Pool } from 'pg';
import { logger } from '../utils/logger';

const pool = new Pool({
  user: 'maestro',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: 'agent_maestro',
  password: 'maestro123',
  port: 5432,
});

export interface Controller {
  id: string;
  workspace_path: string;
  config: string;
  created_at: Date;
  updated_at: Date;
}

export interface Task {
  id: string;
  controller_id: string;
  type: string;
  status: string;
  result?: string;
  created_at: Date;
}

export async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS controllers (
        id VARCHAR(255) PRIMARY KEY,
        workspace_path TEXT NOT NULL,
        config JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(255) PRIMARY KEY,
        controller_id VARCHAR(255) REFERENCES controllers(id),
        type VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        result TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS tasks_controller_idx ON tasks(controller_id);
      CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);
    `);
    logger.info('Database initialized');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
}

export async function saveController(controller: Omit<Controller, 'created_at' | 'updated_at'>) {
  const { id, workspace_path, config } = controller;
  await pool.query(
    `INSERT INTO controllers (id, workspace_path, config)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE
     SET workspace_path = $2, config = $3, updated_at = NOW()`,
    [id, workspace_path, config]
  );
}

export async function getController(id: string): Promise<Controller | null> {
  const res = await pool.query('SELECT * FROM controllers WHERE id = $1', [id]);
  return res.rows[0] || null;
}

export async function deleteController(id: string) {
  await pool.query('DELETE FROM controllers WHERE id = $1', [id]);
}

export async function saveTask(task: Omit<Task, 'created_at'>) {
  const { id, controller_id, type, status, result } = task;
  await pool.query(
    `INSERT INTO tasks (id, controller_id, type, status, result)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, controller_id, type, status, result]
  );
}

export async function getTasks(controllerId: string): Promise<Task[]> {
  const res = await pool.query(
    'SELECT * FROM tasks WHERE controller_id = $1 ORDER BY created_at DESC',
    [controllerId]
  );
  return res.rows;
}

export async function updateTaskStatus(id: string, status: string, result?: string) {
  await pool.query(
    'UPDATE tasks SET status = $1, result = $2 WHERE id = $3',
    [status, result, id]
  );
}