import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Pastikan variabel lingkungan DATABASE_URL sudah diset di Vercel Dashboard
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    const result = await sql`SELECT * FROM app_versions ORDER BY id ASC`;
    res.status(200).json(result);
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({ message: "Gagal mengambil data dari database" });
  }
}