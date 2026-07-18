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

    const { license_key, device_id } = req.body;
    if (!license_key || !device_id) {
        return res.status(400).json({ success: false, message: 'license_key and device_id are required' });
    }

    try {
        // Cek apakah device ada dan statusnya active
        const check = await sql`
            SELECT status FROM company_devices 
            WHERE id = ${device_id} AND license_key = ${license_key}
        `;
        if (check.length === 0) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }
        if (check[0].status !== 'active') {
            return res.status(400).json({ success: false, message: 'Device is already removed' });
        }

        // Update status menjadi 'removed'
        await sql`
            UPDATE company_devices 
            SET status = 'removed' 
            WHERE id = ${device_id} AND license_key = ${license_key}
        `;

        return res.status(200).json({
            success: true,
            message: 'Device removed successfully. Slot quota is now available.'
        });
    } catch (error) {
        console.error('[REMOVE DEVICE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
