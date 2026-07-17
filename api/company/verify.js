import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const sql = neon(process.env.DATABASE_URL);
const PEPPER = process.env.SERVER_PEPPER;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    const { license_key, fp_primary } = req.body;
    if (!license_key || !fp_primary || fp_primary.length !== 64) {
        return res.status(400).json({ success: false, message: 'Invalid input' });
    }

    if (!PEPPER) return res.status(500).json({ success: false, message: 'Server config error' });

    try {
        const hashedFp = crypto.createHash('sha256').update(fp_primary + PEPPER).digest('hex');

        const device = await sql`
            SELECT d.status, d.device_label, d.activated_at, l.max_devices 
            FROM company_devices d
            JOIN company_licenses l ON d.license_key = l.license_key
            WHERE d.license_key = ${license_key} AND d.fp_hash = ${hashedFp}
        `;

        if (!device || device.length === 0) {
            return res.status(403).json({ success: false, message: 'Device not registered under this license key' });
        }

        const dev = device[0];
        if (dev.status !== 'active') {
            return res.status(403).json({ success: false, message: `Device is ${dev.status}` });
        }

        // Update last_verified_at
        await sql`
            UPDATE company_devices SET last_verified_at = NOW() 
            WHERE license_key = ${license_key} AND fp_hash = ${hashedFp}
        `;

        return res.status(200).json({
            success: true,
            message: 'License valid',
            license_key: license_key,
            status: dev.status,
            device_label: dev.device_label,
            activated_at: dev.activated_at,
            max_devices: dev.max_devices
        });

    } catch (error) {
        console.error('[VERIFY ERROR]', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
