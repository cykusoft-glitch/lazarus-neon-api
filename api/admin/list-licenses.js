import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const providedKey = req.headers['x-admin-key'];
    if (!providedKey || providedKey !== ADMIN_API_KEY) {
        return res.status(403).json({ success: false, message: 'Forbidden: Invalid Admin Key' });
    }

    try {
        const result = await sql`
            SELECT license_key, company_name, max_devices, status, expires_at, created_at, created_by_admin
            FROM company_licenses 
            ORDER BY id DESC
        `;
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error('[LIST LICENSES ERROR]', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
