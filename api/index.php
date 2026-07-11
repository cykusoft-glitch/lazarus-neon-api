<?php
$db_url = getenv('DATABASE_URL');
try {
    $pdo = new PDO($db_url);
    $stmt = $pdo->query("SELECT NOW()");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    echo json_encode(['status' => 'success', 'time' => $row['now']]);
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
