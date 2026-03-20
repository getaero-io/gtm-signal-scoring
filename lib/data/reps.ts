import { writeQuery } from '@/lib/db-write';
import { Rep } from '@/types/inbound';

export async function getReps(): Promise<Rep[]> {
  return writeQuery<Rep>(
    `SELECT * FROM inbound.reps WHERE is_active = true ORDER BY role, name`
  );
}

export async function getRepByRole(role: string): Promise<Rep | null> {
  const rows = await writeQuery<Rep>(
    `SELECT r.*,
       COUNT(l.id) FILTER (
         WHERE l.submitted_at::date = CURRENT_DATE
       ) as leads_today
     FROM inbound.reps r
     LEFT JOIN inbound.leads l ON l.assigned_rep_id = r.id
     WHERE r.is_active = true AND r.role = $1
     GROUP BY r.id
     HAVING COUNT(l.id) FILTER (WHERE l.submitted_at::date = CURRENT_DATE) < r.max_leads_per_day
     ORDER BY leads_today ASC, r.name ASC
     LIMIT 1`,
    [role]
  );
  return rows[0] || null;
}

export async function createRep(data: { name: string; email: string; role: string; max_leads_per_day: number }): Promise<Rep> {
  const rows = await writeQuery<Rep>(
    `INSERT INTO inbound.reps (name, email, role, max_leads_per_day)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.name, data.email, data.role, data.max_leads_per_day]
  );
  return rows[0];
}

export async function updateRep(id: string, data: { name?: string; role?: string; max_leads_per_day?: number; is_active?: boolean }): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  if (data.name !== undefined) { fields.push(`name = $${i++}`); values.push(data.name); }
  if (data.role !== undefined) { fields.push(`role = $${i++}`); values.push(data.role); }
  if (data.max_leads_per_day !== undefined) { fields.push(`max_leads_per_day = $${i++}`); values.push(data.max_leads_per_day); }
  if (data.is_active !== undefined) { fields.push(`is_active = $${i++}`); values.push(data.is_active); }

  if (fields.length === 0) return;
  values.push(id);

  await writeQuery(
    `UPDATE inbound.reps SET ${fields.join(', ')} WHERE id = $${i}`,
    values
  );
}

export async function deleteRep(id: string): Promise<void> {
  await writeQuery(`UPDATE inbound.reps SET is_active = false WHERE id = $1`, [id]);
}
