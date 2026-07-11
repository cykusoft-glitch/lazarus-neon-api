<?php
// Menerima data dari aplikasi Lazarus
header('Content-Type: application/json');

// Mengambil URL dari Environment Variable di Render nanti
$db_url = getenv('DATABASE_URL'); 

try {
    $pdo = new PDO($db_url, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    // Contoh query sederhana untuk testing
    $stmt = $pdo->query("SELECT NOW()");
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode(['status' => 'success', 'data' => $result]);
} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>
