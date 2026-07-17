import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const sql = neon(process.env.DATABASE_URL);
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

function generateLicenseKey() {
    const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `SOL-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}`;
}

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

    const { company_name, max_devices, expires_at, created_by } = req.body;
    if (!company_name || typeof max_devices !== 'number' || max_devices < 0) {
        return res.status(400).json({ success: false, message: 'Invalid input: company_name and max_devices required' });
    }

    try {
        let license_key = generateLicenseKey();
        let attempts = 0;
        let isUnique = false;
        while (!isUnique && attempts < 5) {
            const check = await sql`SELECT 1 FROM company_licenses WHERE license_key = ${license_key}`;
            if (check.length === 0) isUnique = true;
            else { license_key = generateLicenseKey(); attempts++; }
        }
        if (!isUnique) throw new Error('Failed to generate unique key');

        await sql`
            INSERT INTO company_licenses (license_key, company_name, max_devices, expires_at, created_by_admin, created_at)
            VALUES (${license_key}, ${company_name}, ${max_devices}, ${expires_at || null}, ${created_by || 'Admin'}, NOW())
        `;

        return res.status(201).json({
            success: true,
            message: 'License generated successfully',
            license_key: license_key,
            max_devices: max_devices,
            expires_at: expires_at || null
        });
    } catch (error) {
        console.error('[GENERATE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
