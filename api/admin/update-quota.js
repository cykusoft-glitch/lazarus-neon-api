import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const providedKey = req.headers['x-admin-key'];
    if (!providedKey || providedKey !== ADMIN_API_KEY) {
        return res.status(403).json({ success: false, message: 'Forbidden: Invalid Admin Key' });
    }

    const { license_key, new_max_devices } = req.body;
    if (!license_key || typeof new_max_devices !== 'number' || new_max_devices < 0) {
        return res.status(400).json({ success: false, message: 'Invalid input' });
    }

    try {
        // Pastikan lisensi ada
        const check = await sql`
            SELECT license_key FROM company_licenses WHERE license_key = ${license_key}
        `;
        if (check.length === 0) {
            return res.status(404).json({ success: false, message: 'License not found' });
        }

        await sql`
            UPDATE company_licenses 
            SET max_devices = ${new_max_devices} 
            WHERE license_key = ${license_key}
        `;

        return res.status(200).json({
            success: true,
            message: `Quota updated to ${new_max_devices}`,
            new_max_devices: new_max_devices
        });
    } catch (error) {
        console.error('[UPDATE QUOTA ERROR]', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
