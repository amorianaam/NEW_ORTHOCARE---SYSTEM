-- ==============================================================================
--  ORTHOCARE ERP - SEED DATA: LAB & RADIOLOGY CATALOG
--  أوامر إدخال تصنيفات وفحوصات المختبر (التحاليل) والأشعة إلى قاعدة البيانات
-- ==============================================================================

USE orthocare_db;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. التأكد من وجود أعمدة الأسعار في جدول الأشعة
ALTER TABLE radiology_tests 
  ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER name,
  ADD COLUMN IF NOT EXISTS price_with_film DECIMAL(10,2) NULL AFTER price,
  ADD COLUMN IF NOT EXISTS price_without_film DECIMAL(10,2) NULL AFTER price_with_film;

-- ==============================================================================
-- 2. تصنيفات التحاليل المخبرية (Lab Categories)
-- ==============================================================================
INSERT INTO lab_categories (name, is_deleted) VALUES
('BLOOD SUGAR', 0),
('HAEMATOLOGY TESTS', 0),
('RENAL FUNCTION', 0),
('LIVER FUNCTION', 0),
('VIROLOGY', 0),
('CHEMISTRY & VITAMINS', 0),
('SEROLOGY & IMMUNOLOGY', 0),
('URINE & STOOL', 0)
ON DUPLICATE KEY UPDATE is_deleted = 0;


-- ==============================================================================
-- 3. فحوصات التحاليل المخبرية (Lab Tests)
-- ==============================================================================
INSERT INTO lab_tests (category_id, name, price, is_active, is_deleted) VALUES
-- فئة سكر الدم (BLOOD SUGAR)
((SELECT id FROM lab_categories WHERE name = 'BLOOD SUGAR' LIMIT 1), 'HBA1C', 9000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'BLOOD SUGAR' LIMIT 1), 'RBS', 2000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'BLOOD SUGAR' LIMIT 1), 'FBS', 3000.00, 1, 0),

-- فئة أمراض وتخثر الدم (HAEMATOLOGY TESTS)
((SELECT id FROM lab_categories WHERE name = 'HAEMATOLOGY TESTS' LIMIT 1), 'CBC', 3000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'HAEMATOLOGY TESTS' LIMIT 1), 'ESR', 2000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'HAEMATOLOGY TESTS' LIMIT 1), 'BLOOD GROUP', 2000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'HAEMATOLOGY TESTS' LIMIT 1), 'PT / INR', 4000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'HAEMATOLOGY TESTS' LIMIT 1), 'PTT', 4000.00, 1, 0),

-- فئة وظائف الكلى (RENAL FUNCTION)
((SELECT id FROM lab_categories WHERE name = 'RENAL FUNCTION' LIMIT 1), 'CREATININE', 2000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'RENAL FUNCTION' LIMIT 1), 'UREA', 2000.00, 1, 0),

-- فئة وظائف الكبد (LIVER FUNCTION)
((SELECT id FROM lab_categories WHERE name = 'LIVER FUNCTION' LIMIT 1), 'SGPT (ALT)', 3000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'LIVER FUNCTION' LIMIT 1), 'SGOT (AST)', 3000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'LIVER FUNCTION' LIMIT 1), 'ALBUMIN', 2000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'LIVER FUNCTION' LIMIT 1), 'T.PROTEIN', 2000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'LIVER FUNCTION' LIMIT 1), 'T.BILIRUBIN', 2000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'LIVER FUNCTION' LIMIT 1), 'D.BILIRUBIN', 2000.00, 1, 0),

-- فئة الفيروسات (VIROLOGY)
((SELECT id FROM lab_categories WHERE name = 'VIROLOGY' LIMIT 1), 'HBSAG', 3000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'VIROLOGY' LIMIT 1), 'HCV AB', 3000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'VIROLOGY' LIMIT 1), 'HIV', 3000.00, 1, 0),

-- فئة الكيمياء الحيوية والمعادن والفيتامينات (CHEMISTRY & VITAMINS)
((SELECT id FROM lab_categories WHERE name = 'CHEMISTRY & VITAMINS' LIMIT 1), 'VIT. D3', 18000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'CHEMISTRY & VITAMINS' LIMIT 1), 'B12', 10000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'CHEMISTRY & VITAMINS' LIMIT 1), 'S.CA', 3000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'CHEMISTRY & VITAMINS' LIMIT 1), 'S.P', 3000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'CHEMISTRY & VITAMINS' LIMIT 1), 'S.ALP', 2000.00, 1, 0),

-- فئة الأمصال والمناعة والروماتيزم (SEROLOGY & IMMUNOLOGY)
((SELECT id FROM lab_categories WHERE name = 'SEROLOGY & IMMUNOLOGY' LIMIT 1), 'ANTI CCP', 20000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'SEROLOGY & IMMUNOLOGY' LIMIT 1), 'RF.T', 2000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'SEROLOGY & IMMUNOLOGY' LIMIT 1), 'CRP.T', 2000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'SEROLOGY & IMMUNOLOGY' LIMIT 1), 'URIC ACID', 2000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'SEROLOGY & IMMUNOLOGY' LIMIT 1), 'ASO', 3000.00, 1, 0),

-- فئة الفحوصات العامة (URINE & STOOL)
((SELECT id FROM lab_categories WHERE name = 'URINE & STOOL' LIMIT 1), 'URINE ANALYSIS', 2000.00, 1, 0),
((SELECT id FROM lab_categories WHERE name = 'URINE & STOOL' LIMIT 1), 'STOOL ANALYSIS', 2000.00, 1, 0)

ON DUPLICATE KEY UPDATE 
  category_id = VALUES(category_id),
  price = VALUES(price),
  is_active = 1,
  is_deleted = 0;


-- ==============================================================================
-- 4. تصنيفات الأشعة (Radiology Categories)
-- ==============================================================================
INSERT INTO radiology_categories (name, is_deleted) VALUES
('X-Ray Extremities (أشعة الأطراف)', 0),
('X-Ray Spine (العمود الفقري)', 0),
('X-Ray Pelvis & Hip (الحوض والورك)', 0),
('X-Ray Skull & Head (الجمجمة والرأس)', 0),
('X-Ray Chest & Ribs (الصدر والأضلاع)', 0)
ON DUPLICATE KEY UPDATE is_deleted = 0;


-- ==============================================================================
-- 5. فحوصات الأشعة (Radiology Tests)
-- ==============================================================================
INSERT INTO radiology_tests (category_id, name, price, price_with_film, price_without_film, is_active, is_deleted) VALUES
-- أشعة الأطراف (Extremities)
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Extremities (أشعة الأطراف)' LIMIT 1), 'Rt. & Lt. FOOT', 26000.00, 26000.00, 20000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Extremities (أشعة الأطراف)' LIMIT 1), 'Rt. & Lt. Leg', 17000.00, 17000.00, 12000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Extremities (أشعة الأطراف)' LIMIT 1), 'Rt. & Lt. Knee joint', 20000.00, 20000.00, 17000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Extremities (أشعة الأطراف)' LIMIT 1), 'Rt. & Lt. femur', 20000.00, 20000.00, 15000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Extremities (أشعة الأطراف)' LIMIT 1), 'Rt. & Lt. Hand', 3000.00, 3000.00, 3000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Extremities (أشعة الأطراف)' LIMIT 1), 'Rt. & Lt. Forearm', 3000.00, 3000.00, 3000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Extremities (أشعة الأطراف)' LIMIT 1), 'Rt. & Lt. Clavicle', 15000.00, 15000.00, 10000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Extremities (أشعة الأطراف)' LIMIT 1), 'Rt. & Lt. Shoulder joint', 15000.00, 15000.00, 10000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Extremities (أشعة الأطراف)' LIMIT 1), 'Rt. & Lt. Ankle joint', 15000.00, 15000.00, 10000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Extremities (أشعة الأطراف)' LIMIT 1), 'Rt. & Lt. Wrist joint', 10000.00, 10000.00, 8000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Extremities (أشعة الأطراف)' LIMIT 1), 'Rt. & Lt. Elbow joint', 12000.00, 12000.00, 8000.00, 1, 0),

-- أشعة العمود الفقري (Spine)
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Spine (العمود الفقري)' LIMIT 1), 'Cervical Spine', 35000.00, 35000.00, 30000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Spine (العمود الفقري)' LIMIT 1), 'Dorsal Spine', 17000.00, 17000.00, 12000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Spine (العمود الفقري)' LIMIT 1), 'Lumbo / sacral spine', 30000.00, 30000.00, 17000.00, 1, 0),

-- أشعة الحوض والورك (Pelvis & Hip)
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Pelvis & Hip (الحوض والورك)' LIMIT 1), 'Pelvis AP', 20000.00, 20000.00, 15000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Pelvis & Hip (الحوض والورك)' LIMIT 1), 'Rt. & Lt. Hip joint', 20000.00, 20000.00, 15000.00, 1, 0),

-- أشعة الجمجمة والرأس (Skull & Head)
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Skull & Head (الجمجمة والرأس)' LIMIT 1), 'Skull AP/Lat', 17000.00, 17000.00, 17000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Skull & Head (الجمجمة والرأس)' LIMIT 1), 'Facial Bones', 17000.00, 17000.00, 15000.00, 1, 0),

-- أشعة الصدر والأضلاع (Chest & Ribs)
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Chest & Ribs (الصدر والأضلاع)' LIMIT 1), 'Chest PA', 15000.00, 15000.00, 10000.00, 1, 0),
((SELECT id FROM radiology_categories WHERE name = 'X-Ray Chest & Ribs (الصدر والأضلاع)' LIMIT 1), 'Ribs', 15000.00, 15000.00, 10000.00, 1, 0)

ON DUPLICATE KEY UPDATE 
  category_id = VALUES(category_id),
  price = VALUES(price),
  price_with_film = VALUES(price_with_film),
  price_without_film = VALUES(price_without_film),
  is_active = 1,
  is_deleted = 0;

SET FOREIGN_KEY_CHECKS = 1;
