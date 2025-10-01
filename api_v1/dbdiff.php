<?php
header('Content-Type: application/json');

function connectDatabase($config) {
    $conn = new mysqli(
        $config['connection_host'],
        $config['connection_username'],
        $config['connection_password'],
        $config['connection_database']
    );

    if ($conn->connect_error) {
        die(json_encode([
            "status" => "0",
            "message" => "Connection failed: " . $conn->connect_error
        ]));
    }

    return $conn;
}

function getTables($conn) {
    $tables = [];
    $result = $conn->query("SHOW TABLES");
    while ($row = $result->fetch_array()) {
        $tables[] = $row[0];
    }
    return $tables;
}

function getTableStructure($conn, $table) {
    $structure = [];
    $result = $conn->query("SHOW FULL COLUMNS FROM `$table`");
    while ($row = $result->fetch_assoc()) {
        $structure[$row['Field']] = $row;
    }
    return $structure;
}

function getTableCreateStatement($conn, $table) {
    $res = $conn->query("SHOW CREATE TABLE `$table`");
    $row = $res->fetch_assoc();
    return $row['Create Table'];
}

function getFunctions($conn) {
    $functions = [];
    $res = $conn->query("SHOW FUNCTION STATUS WHERE Db = DATABASE()");
    while ($row = $res->fetch_assoc()) {
        $functions[] = $row['Name'];
    }
    return $functions;
}

function getProcedures($conn) {
    $procedures = [];
    $res = $conn->query("SHOW PROCEDURE STATUS WHERE Db = DATABASE()");
    while ($row = $res->fetch_assoc()) {
        $procedures[] = $row['Name'];
    }
    return $procedures;
}

function getEvents($conn) {
    $events = [];
    $res = $conn->query("SHOW EVENTS");
    while ($row = $res->fetch_assoc()) {
        $events[] = $row['Name'];
    }
    return $events;
}

function getTriggers($conn) {
    $triggers = [];
    $res = $conn->query("SHOW TRIGGERS");
    while ($row = $res->fetch_assoc()) {
        $triggers[] = $row['Trigger'];
    }
    return $triggers;
}

function getTableIndexes($conn, $table) {
    $indexes = [];
    $result = $conn->query("SHOW INDEX FROM `$table`");
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $key = $row['Key_name'];
            if ($key !== 'PRIMARY') {
                if (!isset($indexes[$key])) {
                    $indexes[$key] = [
                        'name' => $key,
                        'unique' => $row['Non_unique'] == 0,
                        'columns' => []
                    ];
                }
                $indexes[$key]['columns'][] = $row['Column_name'];
            }
        }
    }
    return $indexes;
}

function getForeignKeys($conn, $table) {
    $fks = [];
    $result = $conn->query("
        SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = '$table' 
        AND REFERENCED_TABLE_NAME IS NOT NULL
    ");
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $fks[] = $row;
        }
    }
    return $fks;
}

function getViews($conn) {
    $views = [];
    $result = $conn->query("SHOW FULL TABLES WHERE Table_type = 'VIEW'");
    if ($result) {
        while ($row = $result->fetch_array()) {
            $views[] = $row[0];
        }
    }
    return $views;
}

function getViewDefinition($conn, $view) {
    $result = $conn->query("SHOW CREATE VIEW `$view`");
    if ($result) {
        $row = $result->fetch_assoc();
        return $row['Create View'];
    }
    return "";
}

// Load input JSON (for testing, can also use POST input)
$input = json_decode(file_get_contents('php://input'), true);

// Sample fallback if not testing with HTTP request
if (!$input) {
    $input = [
        "db1" => [
            "connection_host" => "localhost",
            "connection_username" => "root",
            "connection_password" => "root",
            "connection_database" => "db1"
        ],
        "db2" => [
            "connection_host" => "localhost",
            "connection_username" => "root",
            "connection_password" => "root",
            "connection_database" => "db2"
        ]
    ];
}

$db1 = connectDatabase($input['db1']);
$db2 = connectDatabase($input['db2']);
$db1_name = 'db1: '.$input['db1']['connection_database'];
$db2_name = 'db2: '.$input['db2']['connection_database'];
$tables1 = getTables($db1);
$tables2 = getTables($db2);

$response = [
    "status" => "1",
    "message" => "database compaired successfully",
    "data" => [
        "missing_table" => ["db1" => [], "db2" => []],
        "structure_missmatch_table" => [],
        "missing_column" => ["db1" => [], "db2" => []],
        "structure_missmatch_table_column" => [],
        "missing_function" => ["db1" => [], "db2" => []],
        "missing_procedure" => ["db1" => [], "db2" => []],
        "missing_event" => ["db1" => [], "db2" => []],
        "missing_trigger" => ["db1" => [], "db2" => []],
        "missing_index" => ["db1" => [], "db2" => []],
        "missing_foreign_key" => ["db1" => [], "db2" => []],
        "missing_view" => ["db1" => [], "db2" => []]
    ]
];

// Tables Missing
foreach (array_diff($tables2, $tables1) as $table) {
    $response['data']['missing_table']['db1'][] = [
        "message" => "$table is missing in $db1_name.",
        "table_name" => $table,
        "query" => getTableCreateStatement($db2, $table)
    ];
}
foreach (array_diff($tables1, $tables2) as $table) {
    $response['data']['missing_table']['db2'][] = [
        "message" => "$table is missing in $db2_name.",
        "table_name" => $table,
        "query" => getTableCreateStatement($db1, $table)
    ];
}

// Table Structure and Columns Comparison
$commonTables = array_intersect($tables1, $tables2);
foreach ($commonTables as $table) {
    $stmt1 = $db1->query("SHOW TABLE STATUS WHERE Name = '$table'")->fetch_assoc();
    $stmt2 = $db2->query("SHOW TABLE STATUS WHERE Name = '$table'")->fetch_assoc();

    if ($stmt1['Engine'] !== $stmt2['Engine'] || $stmt1['Collation'] !== $stmt2['Collation']) {
        $response['data']['structure_missmatch_table'][] = [
            "message" => "$table has structure mismatch (Engine or Collation)",
            "table_name" => $table,
            "query_to_match_db1" => "ALTER TABLE `$table` ENGINE={$stmt2['Engine']} COLLATE={$stmt2['Collation']};",
            "query_to_match_db2" => "ALTER TABLE `$table` ENGINE={$stmt1['Engine']} COLLATE={$stmt1['Collation']};"
        ];
    }

    $cols1 = getTableStructure($db1, $table);
    $cols2 = getTableStructure($db2, $table);

    // Missing Columns
    foreach (array_diff(array_keys($cols2), array_keys($cols1)) as $col) {
        $response['data']['missing_column']['db1'][$table][] = [
            "message" => "$col is missing in $table inside $db1_name.",
            "column_name" => $col,
            "query" => "ALTER TABLE `$table` ADD COLUMN `" . $cols2[$col]['Field'] . "` " . $cols2[$col]['Type'] . ";"
        ];
    }
    foreach (array_diff(array_keys($cols1), array_keys($cols2)) as $col) {
        $response['data']['missing_column']['db2'][$table][] = [
            "message" => "$col is missing in $table inside $db2_name.",
            "column_name" => $col,
            "query" => "ALTER TABLE `$table` ADD COLUMN `" . $cols1[$col]['Field'] . "` " . $cols1[$col]['Type'] . ";"
        ];
    }

    // Column Mismatches
    foreach (array_intersect(array_keys($cols1), array_keys($cols2)) as $col) {
        if ($cols1[$col]['Type'] !== $cols2[$col]['Type']) {
            $response['data']['structure_missmatch_table_column'][$table][] = [
                "message" => "$col is " . $cols1[$col]['Type'] . " in $db1_name but " . $cols2[$col]['Type'] . " in $db2_name.",
                "column_name" => $col,
                "query_to_match_db1" => "ALTER TABLE `$table` MODIFY `$col` " . $cols2[$col]['Type'] . ";",
                "query_to_match_db2" => "ALTER TABLE `$table` MODIFY `$col` " . $cols1[$col]['Type'] . ";"
            ];
        }
    }

    // Index Comparison
    $indexes1 = getTableIndexes($db1, $table);
    $indexes2 = getTableIndexes($db2, $table);
    
    foreach (array_diff(array_keys($indexes2), array_keys($indexes1)) as $indexName) {
        $index = $indexes2[$indexName];
        $unique = $index['unique'] ? 'UNIQUE ' : '';
        $columns = implode(', ', array_map(function($col) { return "`$col`"; }, $index['columns']));
        $response['data']['missing_index']['db1'][] = [
            "message" => "Index $indexName is missing in $table inside $db1_name.",
            "index_name" => $indexName,
            "table_name" => $table,
            "query" => "CREATE {$unique}INDEX `$indexName` ON `$table` ($columns);"
        ];
    }
    
    foreach (array_diff(array_keys($indexes1), array_keys($indexes2)) as $indexName) {
        $index = $indexes1[$indexName];
        $unique = $index['unique'] ? 'UNIQUE ' : '';
        $columns = implode(', ', array_map(function($col) { return "`$col`"; }, $index['columns']));
        $response['data']['missing_index']['db2'][] = [
            "message" => "Index $indexName is missing in $table inside $db2_name.",
            "index_name" => $indexName,
            "table_name" => $table,
            "query" => "CREATE {$unique}INDEX `$indexName` ON `$table` ($columns);"
        ];
    }
    
    // Foreign Key Comparison
    $fks1 = getForeignKeys($db1, $table);
    $fks2 = getForeignKeys($db2, $table);
    
    $fkNames1 = array_column($fks1, 'CONSTRAINT_NAME');
    $fkNames2 = array_column($fks2, 'CONSTRAINT_NAME');
    
    foreach (array_diff($fkNames2, $fkNames1) as $fkName) {
        $fk = array_filter($fks2, function($item) use ($fkName) { return $item['CONSTRAINT_NAME'] === $fkName; });
        $fk = reset($fk);
        if ($fk) {
            $response['data']['missing_foreign_key']['db1'][] = [
                "message" => "Foreign key $fkName is missing in $table inside $db1_name.",
                "constraint_name" => $fkName,
                "table_name" => $table,
                "query" => "ALTER TABLE `$table` ADD CONSTRAINT `$fkName` FOREIGN KEY (`{$fk['COLUMN_NAME']}`) REFERENCES `{$fk['REFERENCED_TABLE_NAME']}` (`{$fk['REFERENCED_COLUMN_NAME']}`);"
            ];
        }
    }
    
    foreach (array_diff($fkNames1, $fkNames2) as $fkName) {
        $fk = array_filter($fks1, function($item) use ($fkName) { return $item['CONSTRAINT_NAME'] === $fkName; });
        $fk = reset($fk);
        if ($fk) {
            $response['data']['missing_foreign_key']['db2'][] = [
                "message" => "Foreign key $fkName is missing in $table inside $db2_name.",
                "constraint_name" => $fkName,
                "table_name" => $table,
                "query" => "ALTER TABLE `$table` ADD CONSTRAINT `$fkName` FOREIGN KEY (`{$fk['COLUMN_NAME']}`) REFERENCES `{$fk['REFERENCED_TABLE_NAME']}` (`{$fk['REFERENCED_COLUMN_NAME']}`);"
            ];
        }
    }
}

// Functions, Procedures, Events, Triggers
$fn1 = getFunctions($db1);
$fn2 = getFunctions($db2);
foreach (array_diff($fn2, $fn1) as $fn) {
    $response['data']['missing_function']['db1'][] = [
        "message" => "$fn is missing in $db1_name.",
        "table_name" => $fn,
        "query" => "CREATE FUNCTION $fn (...) RETURNS ... BEGIN ... END"
    ];
}
foreach (array_diff($fn1, $fn2) as $fn) {
    $response['data']['missing_function']['db2'][] = [
        "message" => "$fn is missing in $db2_name.",
        "table_name" => $fn,
        "query" => "CREATE FUNCTION $fn (...) RETURNS ... BEGIN ... END"
    ];
}

// Procedures
$p1 = getProcedures($db1);
$p2 = getProcedures($db2);
foreach (array_diff($p2, $p1) as $p) {
    $response['data']['missing_procedure']['db1'][] = [
        "message" => "$p is missing in $db1_name.",
        "table_name" => $p,
        "query" => "CREATE PROCEDURE $p (...) BEGIN ... END"
    ];
}
foreach (array_diff($p1, $p2) as $p) {
    $response['data']['missing_procedure']['db2'][] = [
        "message" => "$p is missing in $db2_name.",
        "table_name" => $p,
        "query" => "CREATE PROCEDURE $p (...) BEGIN ... END"
    ];
}

// Events
$e1 = getEvents($db1);
$e2 = getEvents($db2);
foreach (array_diff($e2, $e1) as $e) {
    $response['data']['missing_event']['db1'][] = [
        "message" => "$e is missing in $db1_name.",
        "table_name" => $e,
        "query" => "CREATE EVENT $e ON SCHEDULE ... DO ..."
    ];
}
foreach (array_diff($e1, $e2) as $e) {
    $response['data']['missing_event']['db2'][] = [
        "message" => "$e is missing in $db2_name.",
        "table_name" => $e,
        "query" => "CREATE EVENT $e ON SCHEDULE ... DO ..."
    ];
}

// Triggers
$t1 = getTriggers($db1);
$t2 = getTriggers($db2);
foreach (array_diff($t2, $t1) as $t) {
    $response['data']['missing_trigger']['db1'][] = [
        "message" => "$t is missing in $db1_name.",
        "table_name" => $t,
        "query" => "CREATE TRIGGER $t BEFORE INSERT ON ... FOR EACH ROW ..."
    ];
}
foreach (array_diff($t1, $t2) as $t) {
    $response['data']['missing_trigger']['db2'][] = [
        "message" => "$t is missing in $db2_name.",
        "table_name" => $t,
        "query" => "CREATE TRIGGER $t BEFORE INSERT ON ... FOR EACH ROW ..."
    ];
}

// Views Comparison
$views1 = getViews($db1);
$views2 = getViews($db2);

foreach (array_diff($views2, $views1) as $view) {
    $response['data']['missing_view']['db1'][] = [
        "message" => "$view is missing in $db1_name.",
        "view_name" => $view,
        "query" => getViewDefinition($db2, $view)
    ];
}
foreach (array_diff($views1, $views2) as $view) {
    $response['data']['missing_view']['db2'][] = [
        "message" => "$view is missing in $db2_name.",
        "view_name" => $view,
        "query" => getViewDefinition($db1, $view)
    ];
}

echo json_encode($response, JSON_PRETTY_PRINT);
?>