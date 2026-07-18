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

    const { license_key } = req.query;
    if (!license_key) {
        return res.status(400).json({ success: false, message: 'license_key is required' });
    }

    try {
        // Ambil data lisensi
        const license = await sql`
            SELECT license_key, company_name, max_devices, status, expires_at, created_at
            FROM company_licenses WHERE license_key = ${license_key}
        `;
        if (license.length === 0) {
            return res.status(404).json({ success: false, message: 'License not found' });
        }

        // Ambil semua device di bawah lisensi ini
        const devices = await sql`
            SELECT id, fp_hash, fp_secondary_hash, device_label, status, activated_at, last_verified_at
            FROM company_devices WHERE license_key = ${license_key}
            ORDER BY id DESC
        `;

        return res.status(200).json({
            success: true,
            data: {
                license: license[0],
                devices: devices
            }
        });
    } catch (error) {
        console.error('[LICENSE DETAILS ERROR]', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
