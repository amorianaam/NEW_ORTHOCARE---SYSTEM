require('dotenv').config();
const dbConfig = require('../database/db');

(async () => {
  try {
    await dbConfig.query(`ALTER TABLE users MODIFY COLUMN role ENUM('doctor', 'secretary', 'cashier', 'lab', 'radiology',
        'clinical', 'surgery_coordinator', 'or_store', 'general_store', 'auditor') NOT NULL`);

    // --- LAB MIGRATION ---
    await dbConfig.query("ALTER TABLE visit_lab_requests MODIFY status ENUM('pending_payment', 'paid', 'in_progress', 'result_uploaded', 'completed', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending_payment'");
    let [labCols] = await dbConfig.query("SHOW COLUMNS FROM visit_lab_requests LIKE 'result_notes'");
    if (labCols.length === 0) {
      await dbConfig.query("ALTER TABLE visit_lab_requests ADD COLUMN result_notes TEXT NULL AFTER result_file");
    }
    await dbConfig.query("ALTER TABLE visit_lab_requests MODIFY result_file LONGTEXT NULL");

    // --- RADIOLOGY MIGRATION ---
    await dbConfig.query("ALTER TABLE visit_radiology_requests MODIFY status ENUM('pending_payment', 'paid', 'in_progress', 'result_uploaded', 'completed', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending_payment'");
    let [radCols] = await dbConfig.query("SHOW COLUMNS FROM visit_radiology_requests LIKE 'result_notes'");
    if (radCols.length === 0) {
      await dbConfig.query("ALTER TABLE visit_radiology_requests ADD COLUMN result_notes TEXT NULL AFTER result_file");
    }
    await dbConfig.query("ALTER TABLE visit_radiology_requests MODIFY result_file LONGTEXT NULL");

    // Create visit_radiology_films table
    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS visit_radiology_films (
        id INT PRIMARY KEY AUTO_INCREMENT,
        visit_id INT NOT NULL,
        film_size ENUM('large', 'small', 'none') NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

    // Add radiology_film_id to visit_radiology_requests
    let [radFilmIdCols] = await dbConfig.query("SHOW COLUMNS FROM visit_radiology_requests LIKE 'radiology_film_id'");
    if (radFilmIdCols.length === 0) {
      await dbConfig.query("ALTER TABLE visit_radiology_requests ADD COLUMN radiology_film_id INT NULL AFTER with_film");
      await dbConfig.query("ALTER TABLE visit_radiology_requests ADD CONSTRAINT fk_vrr_film FOREIGN KEY (radiology_film_id) REFERENCES visit_radiology_films(id) ON DELETE SET NULL");
    }

    // --- SURGERY MIGRATION ---
    await dbConfig.query("ALTER TABLE surgeries MODIFY status ENUM('planned', 'scheduled', 'ready', 'post_op', 'completed', 'cancelled') NOT NULL DEFAULT 'planned'");
    
    let [surgCurCol] = await dbConfig.query("SHOW COLUMNS FROM surgeries LIKE 'currency'");
    if (surgCurCol.length === 0) {
      await dbConfig.query("ALTER TABLE surgeries ADD COLUMN currency ENUM('YER', 'USD', 'SAR') NOT NULL DEFAULT 'YER' AFTER full_price");
    }

    let [payCurCol] = await dbConfig.query("SHOW COLUMNS FROM surgery_payments LIKE 'currency'");
    if (payCurCol.length === 0) {
      await dbConfig.query("ALTER TABLE surgery_payments ADD COLUMN currency ENUM('YER', 'USD', 'SAR') NOT NULL DEFAULT 'YER' AFTER amount");
      await dbConfig.query("ALTER TABLE surgery_payments ADD COLUMN exchange_rate DECIMAL(10, 2) NOT NULL DEFAULT 1.00 AFTER currency");
    }

    let [transfCols1] = await dbConfig.query("SHOW COLUMNS FROM inventory_transfers LIKE 'general_item_id'");
    if (transfCols1.length === 0) {
      await dbConfig.query("ALTER TABLE inventory_transfers ADD COLUMN general_item_id INT NULL AFTER to_store");
      await dbConfig.query("ALTER TABLE inventory_transfers ADD COLUMN or_item_id INT NULL AFTER general_item_id");
    }

    let [radItemCol] = await dbConfig.query("SHOW COLUMNS FROM inventory_transfers LIKE 'rad_item_id'");
    if (radItemCol.length === 0) {
      await dbConfig.query("ALTER TABLE inventory_transfers ADD COLUMN rad_item_id INT NULL AFTER or_item_id");
    }

    await dbConfig.query("ALTER TABLE inventory_transfers MODIFY from_store ENUM('general', 'or', 'radiology') NOT NULL, MODIFY to_store ENUM('general', 'or', 'radiology') NOT NULL");

    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS rad_inventory_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        film_type ENUM('large', 'small', 'none') NOT NULL DEFAULT 'none',
        unit VARCHAR(50) NOT NULL DEFAULT 'فيلم',
        quantity DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
        min_quantity DECIMAL(12, 4) NOT NULL DEFAULT 5.0000,
        cost_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        expiry_date DATE NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_film_type (film_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS clinical_consumption_log (
        id INT PRIMARY KEY AUTO_INCREMENT,
        store ENUM('radiology', 'lab') NOT NULL DEFAULT 'radiology',
        item_id INT NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        item_unit VARCHAR(50) NOT NULL,
        qty_deducted DECIMAL(10, 4) NOT NULL,
        visit_id INT NULL,
        visit_number VARCHAR(100) NULL,
        patient_name VARCHAR(255) NULL,
        service_id INT NULL,
        service_name VARCHAR(255) NULL,
        trigger_type ENUM('procedure_consumption', 'wastage', 'reversal', 'manual') NOT NULL DEFAULT 'procedure_consumption',
        notes TEXT NULL,
        performed_by INT NULL,
        performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_store (store),
        INDEX idx_visit (visit_id),
        INDEX idx_item (item_id),
        INDEX idx_performed_at (performed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

    let [genColsFilm] = await dbConfig.query("SHOW COLUMNS FROM general_inventory_items LIKE 'film_type'");
    if (genColsFilm.length === 0) {
      await dbConfig.query("ALTER TABLE general_inventory_items ADD COLUMN film_type ENUM('large', 'small', 'none') NOT NULL DEFAULT 'none' AFTER unit");
    }

    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS inventory_stocktaking (
        id INT PRIMARY KEY AUTO_INCREMENT,
        store_type ENUM('general', 'or') NOT NULL,
        status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
        created_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS inventory_stocktaking_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        stocktaking_id INT NOT NULL,
        item_id INT NOT NULL,
        expected_quantity DECIMAL(10, 2) NOT NULL,
        actual_quantity DECIMAL(10, 2) NOT NULL,
        difference DECIMAL(10, 2) NOT NULL,
        notes TEXT,
        FOREIGN KEY (stocktaking_id) REFERENCES inventory_stocktaking(id) ON DELETE CASCADE
      )
    `);

    // --- NEW CLINICAL CATALOGS & EMR MIGRATION ---

    // 1. medications
    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS medications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. clinical_categories
    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS clinical_categories (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. clinical_services
    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS clinical_services (
        id INT PRIMARY KEY AUTO_INCREMENT,
        category_id INT NULL,
        name VARCHAR(255) NOT NULL UNIQUE,
        price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES clinical_categories(id) ON DELETE SET NULL
      )
    `);

    // 4. surgery_prep_packages
    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS surgery_prep_packages (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. surgery_prep_items
    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS surgery_prep_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        package_id INT NOT NULL,
        item_type ENUM('lab', 'radiology') NOT NULL,
        item_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (package_id) REFERENCES surgery_prep_packages(id) ON DELETE CASCADE
      )
    `);

    // 6. prescriptions
    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        visit_id INT NOT NULL,
        patient_id INT NOT NULL,
        doctor_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 7. prescription_items
    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS prescription_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        prescription_id INT NOT NULL,
        medication_name VARCHAR(255) NOT NULL,
        dosage VARCHAR(255) NULL,
        duration VARCHAR(255) NULL,
        instructions TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE
      )
    `);

    // 8. visit_clinical_service_requests
    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS visit_clinical_service_requests (
        id INT PRIMARY KEY AUTO_INCREMENT,
        visit_id INT NOT NULL,
        service_id INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        final_price DECIMAL(10,2) NOT NULL,
        is_free BOOLEAN NOT NULL DEFAULT FALSE,
        status ENUM('pending_payment', 'paid', 'completed', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending_payment',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES clinical_services(id) ON DELETE CASCADE
      )
    `);

    // 9. Add discount and free columns to visit_lab_requests
    let [labDiscCols] = await dbConfig.query("SHOW COLUMNS FROM visit_lab_requests LIKE 'discount_percentage'");
    if (labDiscCols.length === 0) {
      await dbConfig.query("ALTER TABLE visit_lab_requests ADD COLUMN discount_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00 AFTER price");
      await dbConfig.query("ALTER TABLE visit_lab_requests ADD COLUMN discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER discount_percentage");
      await dbConfig.query("ALTER TABLE visit_lab_requests ADD COLUMN final_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER discount_amount");
      await dbConfig.query("ALTER TABLE visit_lab_requests ADD COLUMN is_free BOOLEAN NOT NULL DEFAULT FALSE AFTER final_price");
      await dbConfig.query("UPDATE visit_lab_requests SET final_price = price");
    }

    // 10. Add discount and free columns to visit_radiology_requests
    let [radDiscCols] = await dbConfig.query("SHOW COLUMNS FROM visit_radiology_requests LIKE 'discount_percentage'");
    if (radDiscCols.length === 0) {
      await dbConfig.query("ALTER TABLE visit_radiology_requests ADD COLUMN discount_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00 AFTER price");
      await dbConfig.query("ALTER TABLE visit_radiology_requests ADD COLUMN discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER discount_percentage");
      await dbConfig.query("ALTER TABLE visit_radiology_requests ADD COLUMN final_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER discount_amount");
      await dbConfig.query("ALTER TABLE visit_radiology_requests ADD COLUMN is_free BOOLEAN NOT NULL DEFAULT FALSE AFTER final_price");
      await dbConfig.query("UPDATE visit_radiology_requests SET final_price = price");
    }

    // 11. Add price_without_film to radiology_tests
    let [radFilmCols] = await dbConfig.query("SHOW COLUMNS FROM radiology_tests LIKE 'price_without_film'");
    if (radFilmCols.length === 0) {
      await dbConfig.query("ALTER TABLE radiology_tests ADD COLUMN price_without_film DECIMAL(10, 2) NULL AFTER price");
    }

    // 12. Create doctor_favorites table
    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS doctor_favorites (
        id INT PRIMARY KEY AUTO_INCREMENT,
        doctor_id INT NOT NULL,
        type ENUM('medication', 'lab', 'radiology', 'bundle') NOT NULL,
        name VARCHAR(255) NOT NULL,
        details TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

    // 13. Create password_change_requests table
    await dbConfig.query(`
      CREATE TABLE IF NOT EXISTS password_change_requests (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        new_password_hash VARCHAR(255) NOT NULL,
        status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME NULL,
        resolved_by INT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

    // 14. Add is_exempt to visits table
    let [visitExemptCols] = await dbConfig.query("SHOW COLUMNS FROM visits LIKE 'is_exempt'");
    if (visitExemptCols.length === 0) {
      await dbConfig.query("ALTER TABLE visits ADD COLUMN is_exempt TINYINT(1) NOT NULL DEFAULT 0 AFTER is_follow_up");
    }

    // 15. Add plain_password to users table
    let [plainPassCols] = await dbConfig.query("SHOW COLUMNS FROM users LIKE 'plain_password'");
    if (plainPassCols.length === 0) {
      await dbConfig.query("ALTER TABLE users ADD COLUMN plain_password VARCHAR(255) NULL AFTER password_hash");
    }

    console.log('[DB] Migration script completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('[DB] Migration script error:', err.message);
    process.exit(1);
  }
})();
