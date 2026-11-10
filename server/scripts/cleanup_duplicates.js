const db = require('../database/db');

async function runCleanup() {
  const conn = await db.getConnection();
  try {
    console.log('[CLEANUP] Starting safe catalog deduplication transaction...');
    await conn.beginTransaction();

    // =========================================================================
    // 1. LAB CATEGORIES CONSOLIDATION
    // Target 8 canonical categories:
    // - HAEMATOLOGY TESTS (id: 3)
    // - BLOOD SUGAR (id: 9)
    // - RENAL FUNCTION (id: 4)
    // - LIVER FUNCTION (id: 5)
    // - CHEMISTRY & VITAMINS (id: 22)
    // - SEROLOGY & IMMUNOLOGY (id: 23)
    // - VIROLOGY (id: 6)
    // - URINE & STOOL (id: 24)
    // =========================================================================
    console.log('[1/4] Consolidating Lab Categories...');

    // Move any tests from redundant categories to canonical ones
    await conn.execute('UPDATE lab_tests SET category_id = 9 WHERE category_id IN (1, 17)'); // Blood Sugar
    await conn.execute('UPDATE lab_tests SET category_id = 3 WHERE category_id IN (2, 10, 18)'); // Haematology
    await conn.execute('UPDATE lab_tests SET category_id = 4 WHERE category_id IN (11, 19)'); // Renal
    await conn.execute('UPDATE lab_tests SET category_id = 5 WHERE category_id IN (12, 20)'); // Liver
    await conn.execute('UPDATE lab_tests SET category_id = 6 WHERE category_id IN (13, 21)'); // Virology
    await conn.execute('UPDATE lab_tests SET category_id = 22 WHERE category_id IN (7, 14)'); // Chemistry
    await conn.execute('UPDATE lab_tests SET category_id = 23 WHERE category_id IN (8, 15)'); // Serology
    await conn.execute('UPDATE lab_tests SET category_id = 24 WHERE category_id IN (16)'); // Urine & Stool

    // Ensure the 8 canonical categories are active
    const canonicalLabCatIds = [3, 9, 4, 5, 22, 23, 6, 24];
    await conn.execute(
      `UPDATE lab_categories SET is_deleted = 0 WHERE id IN (${canonicalLabCatIds.join(',')})`
    );

    // Delete redundant lab categories
    await conn.execute(
      `DELETE FROM lab_categories WHERE id NOT IN (${canonicalLabCatIds.join(',')})`
    );
    console.log('   Lab categories consolidated to 8 clean canonical categories.');

    // =========================================================================
    // 2. RADIOLOGY CATEGORIES CONSOLIDATION
    // Target 5 canonical categories:
    // - X-Ray Extremities (أشعة الأطراف) (id: 4)
    // - X-Ray Spine (العمود الفقري) (id: 5)
    // - X-Ray Skull & Head (الجمجمة والرأس) (id: 6)
    // - X-Ray Pelvis & Hip (الحوض والورك) (id: 7)
    // - X-Ray Chest & Ribs (الصدر والأضلاع) (id: 8)
    // =========================================================================
    console.log('[2/4] Consolidating Radiology Categories...');

    // Standardize category names
    await conn.execute("UPDATE radiology_categories SET name = 'X-Ray Extremities (أشعة الأطراف)' WHERE id = 4");
    await conn.execute("UPDATE radiology_categories SET name = 'X-Ray Pelvis & Hip (الحوض والورك)' WHERE id = 7");
    await conn.execute("UPDATE radiology_categories SET name = 'X-Ray Chest & Ribs (الصدر والأضلاع)' WHERE id = 8");

    // Move tests from redundant radiology categories to canonical ones
    await conn.execute('UPDATE radiology_tests SET category_id = 4 WHERE category_id = 9'); // Extremities
    await conn.execute('UPDATE radiology_tests SET category_id = 5 WHERE category_id IN (2, 10)'); // Spine
    await conn.execute('UPDATE radiology_tests SET category_id = 6 WHERE category_id IN (12)'); // Skull
    await conn.execute('UPDATE radiology_tests SET category_id = 7 WHERE category_id IN (11)'); // Pelvis & Hip
    await conn.execute('UPDATE radiology_tests SET category_id = 8 WHERE category_id IN (13)'); // Chest

    const canonicalRadCatIds = [4, 5, 6, 7, 8];
    await conn.execute(
      `UPDATE radiology_categories SET is_deleted = 0 WHERE id IN (${canonicalRadCatIds.join(',')})`
    );

    // Delete redundant radiology categories
    await conn.execute(
      `DELETE FROM radiology_categories WHERE id NOT IN (${canonicalRadCatIds.join(',')})`
    );
    console.log('   Radiology categories consolidated to 5 clean canonical categories.');

    // =========================================================================
    // 3. LAB TESTS DEDUPLICATION & RE-POINTING
    // =========================================================================
    console.log('[3/4] Deduplicating Lab Tests & Re-pointing References...');

    // Helper function to re-point and delete a duplicate lab test
    async function mergeLabTest(canonicalId, duplicateIds) {
      for (const dupId of duplicateIds) {
        if (dupId === canonicalId) continue;
        // Re-point visit requests
        await conn.execute('UPDATE visit_lab_requests SET lab_test_id = ? WHERE lab_test_id = ?', [canonicalId, dupId]);
        // Re-point surgery prep items
        await conn.execute("UPDATE surgery_prep_items SET item_id = ? WHERE item_type = 'lab' AND item_id = ?", [canonicalId, dupId]);
        // Re-point doctor favorite tests
        await conn.execute("UPDATE doctor_favorite_tests SET test_id = ? WHERE test_type = 'lab' AND test_id = ?", [canonicalId, dupId]);
        // Re-point doctor favorite bundle items
        await conn.execute("UPDATE doctor_favorite_bundle_items SET test_id = ? WHERE test_type = 'lab' AND test_id = ?", [canonicalId, dupId]);
        // Re-point doctor_favorites_lab
        await conn.execute('UPDATE doctor_favorites_lab SET lab_test_id = ? WHERE lab_test_id = ?', [canonicalId, dupId]).catch(() => {});
        // Re-point lab_test_consumables
        await conn.execute('UPDATE lab_test_consumables SET lab_test_id = ? WHERE lab_test_id = ?', [canonicalId, dupId]).catch(() => {});
        // Delete duplicate test record
        await conn.execute('DELETE FROM lab_tests WHERE id = ?', [dupId]);
      }
    }

    // Deduplication mappings for all duplicate lab groups:
    await mergeLabTest(30, [1, 57]);       // HbA1c
    await mergeLabTest(2, [31, 58]);       // RBS
    await mergeLabTest(3, [32, 59]);       // FBS
    await mergeLabTest(5, [33, 62]);       // Blood Group
    await mergeLabTest(6, [34, 61]);       // ESR
    await mergeLabTest(7, [35, 60]);       // CBC
    await mergeLabTest(8, [36, 65]);       // Creatinine
    await mergeLabTest(9, [37, 66]);       // Urea
    await mergeLabTest(10, [38, 69]);      // Albumin
    await mergeLabTest(39, [11, 70]);      // T.Protein
    await mergeLabTest(40, [12, 67]);      // SGPT
    await mergeLabTest(13, [41, 68]);      // SGOT
    await mergeLabTest(42, [14, 72]);      // D.Bilirubin
    await mergeLabTest(71, [15, 43]);      // T.Bilirubin
    await mergeLabTest(73, [16, 44]);      // HBsAg
    await mergeLabTest(45, [17, 75]);      // HIV
    await mergeLabTest(18, [46, 74]);      // HCV Ab
    await mergeLabTest(19, [47, 77]);      // B12
    await mergeLabTest(20, [48, 76]);      // Vit. D3
    await mergeLabTest(21, [49, 80]);      // S.ALP
    await mergeLabTest(22, [50, 79]);      // S.P
    await mergeLabTest(23, [51, 78]);      // S.Ca
    await mergeLabTest(24, [52, 84]);      // Uric Acid
    await mergeLabTest(81, [25, 53]);      // Anti CCP
    await mergeLabTest(83, [26, 54]);      // CRP.T
    await mergeLabTest(82, [27, 55]);      // RF.T
    await mergeLabTest(28, [56, 86]);      // Urine Analysis

    // Clean up test names and categories on canonical tests
    await conn.execute("UPDATE lab_tests SET name = 'CREATININE', category_id = 4, is_deleted = 0, is_active = 1 WHERE id = 8");
    await conn.execute("UPDATE lab_tests SET name = 'T.PROTEIN', category_id = 5, is_deleted = 0, is_active = 1 WHERE id = 39");
    await conn.execute("UPDATE lab_tests SET name = 'SGPT', category_id = 5, is_deleted = 0, is_active = 1 WHERE id = 40");
    await conn.execute("UPDATE lab_tests SET name = 'SGOT', category_id = 5, is_deleted = 0, is_active = 1 WHERE id = 13");
    await conn.execute("UPDATE lab_tests SET name = 'D.BILIRUBIN', category_id = 5, is_deleted = 0, is_active = 1 WHERE id = 42");
    await conn.execute("UPDATE lab_tests SET name = 'T.BILIRUBIN', category_id = 5, is_deleted = 0, is_active = 1 WHERE id = 71");
    await conn.execute("UPDATE lab_tests SET name = 'RBS', category_id = 9, is_deleted = 0, is_active = 1 WHERE id = 2");
    await conn.execute("UPDATE lab_tests SET name = 'FBS', category_id = 9, is_deleted = 0, is_active = 1 WHERE id = 3");
    await conn.execute("UPDATE lab_tests SET name = 'HBA1C', category_id = 9, is_deleted = 0, is_active = 1 WHERE id = 30");
    await conn.execute("UPDATE lab_tests SET name = 'URINE ANALYSIS', category_id = 24, is_deleted = 0, is_active = 1 WHERE id = 28");
    await conn.execute("UPDATE lab_tests SET category_id = 24, is_deleted = 0, is_active = 1 WHERE id = 87"); // Stool Analysis
    await conn.execute("UPDATE lab_tests SET category_id = 23, is_deleted = 0, is_active = 1 WHERE id = 85"); // ASO
    await conn.execute("UPDATE lab_tests SET category_id = 3, is_deleted = 0, is_active = 1 WHERE id = 63"); // PT / INR
    await conn.execute("UPDATE lab_tests SET category_id = 3, is_deleted = 0, is_active = 1 WHERE id = 64"); // PTT

    // Delete unused dummy test 29 ('vvv')
    await conn.execute('DELETE FROM lab_tests WHERE id = 29 AND (SELECT COUNT(*) FROM visit_lab_requests WHERE lab_test_id = 29) = 0');
    // Ensure amr (#4) is soft-deleted so it never appears in UI but visit history is safe
    await conn.execute('UPDATE lab_tests SET is_deleted = 1, is_active = 0 WHERE id = 4');

    console.log('   Lab tests successfully deduplicated.');

    // =========================================================================
    // 4. RADIOLOGY TESTS DEDUPLICATION & RE-POINTING
    // =========================================================================
    console.log('[4/4] Deduplicating Radiology Tests & Re-pointing References...');

    async function mergeRadTest(canonicalId, duplicateIds) {
      for (const dupId of duplicateIds) {
        if (dupId === canonicalId) continue;
        // Re-point visit requests
        await conn.execute('UPDATE visit_radiology_requests SET radiology_test_id = ? WHERE radiology_test_id = ?', [canonicalId, dupId]);
        // Re-point surgery prep items
        await conn.execute("UPDATE surgery_prep_items SET item_id = ? WHERE item_type = 'radiology' AND item_id = ?", [canonicalId, dupId]);
        // Re-point doctor favorite tests
        await conn.execute("UPDATE doctor_favorite_tests SET test_id = ? WHERE test_type = 'radiology' AND test_id = ?", [canonicalId, dupId]);
        // Re-point doctor favorite bundle items
        await conn.execute("UPDATE doctor_favorite_bundle_items SET test_id = ? WHERE test_type = 'radiology' AND test_id = ?", [canonicalId, dupId]);
        // Re-point doctor_favorites_radiology
        await conn.execute('UPDATE doctor_favorites_radiology SET radiology_test_id = ? WHERE radiology_test_id = ?', [canonicalId, dupId]).catch(() => {});
        // Delete duplicate test record
        await conn.execute('DELETE FROM radiology_tests WHERE id = ?', [dupId]);
      }
    }

    // Deduplication mappings for clinical radiology tests:
    await mergeRadTest(24, [35, 51]);      // Rt. & Lt. Foot
    await mergeRadTest(25, [36, 52]);      // Rt. & Lt. Leg
    await mergeRadTest(26, [37, 53]);      // Rt. & Lt. Knee joint
    await mergeRadTest(27, [38, 54]);      // Rt. & Lt. Femur
    await mergeRadTest(28, [39, 55]);      // Rt. & Lt. Hand
    await mergeRadTest(29, [40, 56]);      // Rt. & Lt. Forearm
    await mergeRadTest(30, [41, 57]);      // Rt. & Lt. Clavicle
    await mergeRadTest(42, [58]);          // Rt. & Lt. Shoulder joint
    await mergeRadTest(43, [59]);          // Rt. & Lt. Ankle joint
    await mergeRadTest(44, [60]);          // Rt. & Lt. Wrist joint
    await mergeRadTest(31, [45, 64]);      // Lumbo / sacral spine
    await mergeRadTest(32, [46, 63]);      // Dorsal Spine
    await mergeRadTest(33, [47, 62]);      // Cervical Spine
    await mergeRadTest(34, [48, 67]);      // Skull / Skull AP/Lat
    await mergeRadTest(49, [65]);          // Pelvis AP
    await mergeRadTest(50, [69]);          // Chest PA

    // Consolidate dummy test groups so past visits point to one single record:
    await mergeRadTest(9, [6, 12, 17]);    // Test Rad 1
    await mergeRadTest(10, [13, 18]);      // Test Rad 2
    await mergeRadTest(11, [8, 14, 19]);   // Test Rad 3
    await mergeRadTest(15, [16]);          // Test Rad Proxy

    // Delete unused dummy tests (0 visits)
    await conn.execute('DELETE FROM radiology_tests WHERE id IN (3, 21) AND (SELECT COUNT(*) FROM visit_radiology_requests WHERE radiology_test_id IN (3, 21)) = 0');

    // Ensure all remaining dummy tests are soft-deleted
    await conn.execute('UPDATE radiology_tests SET is_deleted = 1, is_active = 0, category_id = NULL WHERE id IN (1, 2, 4, 5, 9, 10, 11, 15, 20, 22, 23)');

    // Assign categories & ensure active on clinical radiology tests:
    // Extremities (category_id: 4)
    await conn.execute('UPDATE radiology_tests SET category_id = 4, is_deleted = 0, is_active = 1 WHERE id IN (24, 25, 26, 27, 28, 29, 30, 42, 43, 44, 61)');
    // Spine (category_id: 5)
    await conn.execute('UPDATE radiology_tests SET category_id = 5, is_deleted = 0, is_active = 1 WHERE id IN (31, 32, 33)');
    // Skull & Head (category_id: 6)
    await conn.execute('UPDATE radiology_tests SET category_id = 6, is_deleted = 0, is_active = 1 WHERE id IN (34, 68)');
    // Pelvis & Hip (category_id: 7)
    await conn.execute('UPDATE radiology_tests SET category_id = 7, is_deleted = 0, is_active = 1 WHERE id IN (49, 66)');
    // Chest & Ribs (category_id: 8)
    await conn.execute('UPDATE radiology_tests SET category_id = 8, is_deleted = 0, is_active = 1 WHERE id IN (50, 70)');

    console.log('   Radiology tests successfully deduplicated.');

    await conn.commit();
    console.log('[CLEANUP] Transaction committed successfully!');

    // =========================================================================
    // 5. POST-CLEANUP VERIFICATION
    // =========================================================================
    const [finalLabCats] = await db.query('SELECT id, name FROM lab_categories WHERE is_deleted = 0 ORDER BY name');
    const [finalRadCats] = await db.query('SELECT id, name FROM radiology_categories WHERE is_deleted = 0 ORDER BY name');
    const [activeLabTests] = await db.query('SELECT id, name, category_id FROM lab_tests WHERE is_deleted = 0 AND is_active = 1');
    const [activeRadTests] = await db.query('SELECT id, name, category_id FROM radiology_tests WHERE is_deleted = 0 AND is_active = 1');

    console.log('\n=== FINAL CLEAN SUMMARY ===');
    console.log(`Active Lab Categories: ${finalLabCats.length} (Expected: 8)`);
    finalLabCats.forEach(c => console.log(`   - [${c.id}] ${c.name}`));

    console.log(`\nActive Radiology Categories: ${finalRadCats.length} (Expected: 5)`);
    finalRadCats.forEach(c => console.log(`   - [${c.id}] ${c.name}`));

    console.log(`\nActive Lab Tests: ${activeLabTests.length}`);
    console.log(`Active Radiology Tests: ${activeRadTests.length}`);

    process.exit(0);
  } catch (err) {
    await conn.rollback();
    console.error('[CLEANUP ERROR] Transaction rolled back due to error:', err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

runCleanup();
