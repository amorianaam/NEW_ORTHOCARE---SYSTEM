-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: 11 نوفمبر 2026 الساعة 01:00
-- إصدار الخادم: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `orthocare_db`
--
CREATE DATABASE IF NOT EXISTS `orthocare_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `orthocare_db`;

-- --------------------------------------------------------

--
-- بنية الجدول `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
CREATE TABLE `audit_log` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(50) NOT NULL,
  `table_name` varchar(50) NOT NULL,
  `record_id` int(11) DEFAULT NULL,
  `old_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`old_values`)),
  `new_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_values`)),
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `cash_shifts`
--

DROP TABLE IF EXISTS `cash_shifts`;
CREATE TABLE `cash_shifts` (
  `id` int(11) NOT NULL,
  `opened_by` int(11) NOT NULL,
  `opened_at` datetime NOT NULL DEFAULT current_timestamp(),
  `opening_balance` decimal(10,2) NOT NULL DEFAULT 0.00,
  `closed_by` int(11) DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `closing_balance` decimal(10,2) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `clinical_categories`
--

DROP TABLE IF EXISTS `clinical_categories`;
CREATE TABLE `clinical_categories` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `clinical_consumption_log`
--

DROP TABLE IF EXISTS `clinical_consumption_log`;
CREATE TABLE `clinical_consumption_log` (
  `id` int(11) NOT NULL,
  `store` enum('radiology','lab') NOT NULL DEFAULT 'radiology',
  `item_id` int(11) NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `item_unit` varchar(50) NOT NULL,
  `qty_deducted` decimal(12,4) NOT NULL,
  `unit_cost` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_cost` decimal(12,2) NOT NULL DEFAULT 0.00,
  `visit_id` int(11) DEFAULT NULL,
  `visit_number` varchar(100) DEFAULT NULL,
  `patient_name` varchar(255) DEFAULT NULL,
  `service_id` int(11) DEFAULT NULL,
  `service_name` varchar(255) DEFAULT NULL,
  `trigger_type` enum('procedure_consumption','wastage','reversal','manual') NOT NULL DEFAULT 'procedure_consumption',
  `notes` text DEFAULT NULL,
  `performed_by` int(11) DEFAULT NULL,
  `performed_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `clinical_services`
--

DROP TABLE IF EXISTS `clinical_services`;
CREATE TABLE `clinical_services` (
  `id` int(11) NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `doctor_favorites`
--

DROP TABLE IF EXISTS `doctor_favorites`;
CREATE TABLE `doctor_favorites` (
  `id` int(11) NOT NULL,
  `doctor_id` int(11) NOT NULL,
  `type` enum('medication','lab','radiology','bundle') NOT NULL,
  `name` varchar(255) NOT NULL,
  `details` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `doctor_favorites_lab`
--

DROP TABLE IF EXISTS `doctor_favorites_lab`;
CREATE TABLE `doctor_favorites_lab` (
  `id` int(11) NOT NULL,
  `doctor_id` int(11) NOT NULL,
  `lab_test_id` int(11) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `doctor_favorites_radiology`
--

DROP TABLE IF EXISTS `doctor_favorites_radiology`;
CREATE TABLE `doctor_favorites_radiology` (
  `id` int(11) NOT NULL,
  `doctor_id` int(11) NOT NULL,
  `radiology_test_id` int(11) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `doctor_favorite_bundles`
--

DROP TABLE IF EXISTS `doctor_favorite_bundles`;
CREATE TABLE `doctor_favorite_bundles` (
  `id` int(11) NOT NULL,
  `doctor_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `doctor_favorite_bundle_items`
--

DROP TABLE IF EXISTS `doctor_favorite_bundle_items`;
CREATE TABLE `doctor_favorite_bundle_items` (
  `id` int(11) NOT NULL,
  `bundle_id` int(11) NOT NULL,
  `test_id` int(11) NOT NULL,
  `test_type` enum('lab','radiology','clinical') NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `doctor_favorite_meds`
--

DROP TABLE IF EXISTS `doctor_favorite_meds`;
CREATE TABLE `doctor_favorite_meds` (
  `id` int(11) NOT NULL,
  `doctor_id` int(11) NOT NULL,
  `medication_name` varchar(255) NOT NULL,
  `dosage` varchar(255) DEFAULT NULL,
  `duration` varchar(255) DEFAULT NULL,
  `instructions` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `frequency` varchar(255) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `doctor_favorite_tests`
--

DROP TABLE IF EXISTS `doctor_favorite_tests`;
CREATE TABLE `doctor_favorite_tests` (
  `id` int(11) NOT NULL,
  `doctor_id` int(11) NOT NULL,
  `test_id` int(11) NOT NULL,
  `test_type` enum('lab','radiology','clinical') NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `doctor_preferred_dosages`
--

DROP TABLE IF EXISTS `doctor_preferred_dosages`;
CREATE TABLE `doctor_preferred_dosages` (
  `id` int(11) NOT NULL,
  `doctor_id` int(11) NOT NULL,
  `medication_name` varchar(255) NOT NULL,
  `dosage` varchar(255) NOT NULL,
  `duration` varchar(255) DEFAULT NULL,
  `instructions` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `financial_transactions`
--

DROP TABLE IF EXISTS `financial_transactions`;
CREATE TABLE `financial_transactions` (
  `id` int(11) NOT NULL,
  `type` enum('income','expense') NOT NULL,
  `category` enum('entry_fee','lab','radiology','clinical','surgery_payment','general_income','general_expense','refund','external_lab','external_radiology','treasury_deposit','external_surgery','emergency_expense','emergency_purchase') NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_method` enum('cash','bank_transfer','installment') NOT NULL DEFAULT 'cash',
  `is_refund` tinyint(1) DEFAULT 0,
  `refund_reason` varchar(255) DEFAULT NULL,
  `visit_id` int(11) DEFAULT NULL,
  `patient_id` int(11) DEFAULT NULL,
  `shift_id` int(11) DEFAULT NULL,
  `surgery_id` int(11) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `performed_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `general_inventory_items`
--

DROP TABLE IF EXISTS `general_inventory_items`;
CREATE TABLE `general_inventory_items` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `unit` varchar(50) DEFAULT NULL,
  `film_type` enum('large','small','none') NOT NULL DEFAULT 'none',
  `quantity` decimal(10,2) DEFAULT 0.00,
  `min_quantity` decimal(10,2) DEFAULT NULL,
  `cost_price` decimal(10,2) DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `general_item_audit_logs`
--

DROP TABLE IF EXISTS `general_item_audit_logs`;
CREATE TABLE `general_item_audit_logs` (
  `id` int(11) NOT NULL,
  `item_id` int(11) DEFAULT NULL,
  `user_id` int(11) NOT NULL,
  `action` varchar(50) NOT NULL,
  `changes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`changes`)),
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `inventory_stocktaking`
--

DROP TABLE IF EXISTS `inventory_stocktaking`;
CREATE TABLE `inventory_stocktaking` (
  `id` int(11) NOT NULL,
  `store_type` enum('general','or') NOT NULL,
  `status` enum('draft','completed') NOT NULL DEFAULT 'draft',
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `completed_at` datetime DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `batch_id` varchar(30) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `inventory_stocktaking_drafts`
--

DROP TABLE IF EXISTS `inventory_stocktaking_drafts`;
CREATE TABLE `inventory_stocktaking_drafts` (
  `id` int(11) NOT NULL,
  `store_type` enum('general') NOT NULL DEFAULT 'general',
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `inventory_stocktaking_draft_items`
--

DROP TABLE IF EXISTS `inventory_stocktaking_draft_items`;
CREATE TABLE `inventory_stocktaking_draft_items` (
  `id` int(11) NOT NULL,
  `draft_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `expected_quantity` decimal(10,2) NOT NULL,
  `actual_quantity` decimal(10,2) NOT NULL,
  `difference` decimal(10,2) NOT NULL,
  `notes` text DEFAULT NULL,
  `unit` varchar(50) DEFAULT NULL,
  `is_counted` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `inventory_stocktaking_items`
--

DROP TABLE IF EXISTS `inventory_stocktaking_items`;
CREATE TABLE `inventory_stocktaking_items` (
  `id` int(11) NOT NULL,
  `stocktaking_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `expected_quantity` decimal(10,2) NOT NULL,
  `actual_quantity` decimal(10,2) NOT NULL,
  `difference` decimal(10,2) NOT NULL,
  `notes` text DEFAULT NULL,
  `unit` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `inventory_transactions`
--

DROP TABLE IF EXISTS `inventory_transactions`;
CREATE TABLE `inventory_transactions` (
  `id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `item_type` enum('general','or') NOT NULL DEFAULT 'general',
  `transaction_type` enum('in','out') NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `unit_price` decimal(10,2) DEFAULT NULL,
  `source_entity` varchar(50) DEFAULT NULL,
  `destination_entity` varchar(50) DEFAULT NULL,
  `reference_id` varchar(30) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `performed_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `inventory_transfers`
--

DROP TABLE IF EXISTS `inventory_transfers`;
CREATE TABLE `inventory_transfers` (
  `id` int(11) NOT NULL,
  `from_store` enum('general','or','radiology','lab') NOT NULL,
  `to_store` enum('general','or','radiology','lab') NOT NULL,
  `general_item_id` int(11) DEFAULT NULL,
  `or_item_id` int(11) DEFAULT NULL,
  `rad_item_id` int(11) DEFAULT NULL,
  `lab_item_id` int(11) DEFAULT NULL,
  `status` enum('pending','sent','received','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `sent_by` int(11) DEFAULT NULL,
  `received_by` int(11) DEFAULT NULL,
  `sent_at` datetime DEFAULT current_timestamp(),
  `received_at` datetime DEFAULT NULL,
  `sent_quantity` decimal(10,2) NOT NULL,
  `received_quantity` decimal(10,2) DEFAULT NULL,
  `batch_ref` varchar(30) DEFAULT NULL,
  `batch_notes` text DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `rejected_by` int(11) DEFAULT NULL,
  `rejected_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `lab_categories`
--

DROP TABLE IF EXISTS `lab_categories`;
CREATE TABLE `lab_categories` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `lab_inventory_items`
--

DROP TABLE IF EXISTS `lab_inventory_items`;
CREATE TABLE `lab_inventory_items` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `category` varchar(100) NOT NULL DEFAULT 'محاليل وكواشف',
  `unit` varchar(50) NOT NULL DEFAULT 'وحدة',
  `quantity` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `min_quantity` decimal(12,4) NOT NULL DEFAULT 5.0000,
  `cost_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `expiry_date` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `lab_tests`
--

DROP TABLE IF EXISTS `lab_tests`;
CREATE TABLE `lab_tests` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `lab_test_consumables`
--

DROP TABLE IF EXISTS `lab_test_consumables`;
CREATE TABLE `lab_test_consumables` (
  `id` int(11) NOT NULL,
  `lab_test_id` int(11) NOT NULL,
  `lab_item_id` int(11) NOT NULL,
  `consumption_mode` enum('per_test','per_unit_yield') NOT NULL DEFAULT 'per_test',
  `quantity_per_test` decimal(12,4) NOT NULL DEFAULT 1.0000,
  `tests_per_unit` decimal(12,4) NOT NULL DEFAULT 1.0000,
  `notes` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `manufacturing_orders`
--

DROP TABLE IF EXISTS `manufacturing_orders`;
CREATE TABLE `manufacturing_orders` (
  `id` int(11) NOT NULL,
  `raw_item_id` int(11) NOT NULL,
  `raw_quantity` decimal(10,2) NOT NULL,
  `produced_item_id` int(11) NOT NULL,
  `produced_quantity` decimal(10,2) NOT NULL,
  `waste_percentage` decimal(5,2) DEFAULT 0.00,
  `cost_per_unit` decimal(10,2) NOT NULL,
  `performed_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `is_reversed` tinyint(1) DEFAULT 0,
  `reversed_at` datetime DEFAULT NULL,
  `reversed_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `medications`
--

DROP TABLE IF EXISTS `medications`;
CREATE TABLE `medications` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `notifications`
--

DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `or_inventory_items`
--

DROP TABLE IF EXISTS `or_inventory_items`;
CREATE TABLE `or_inventory_items` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `unit` varchar(50) DEFAULT NULL,
  `quantity` decimal(10,2) DEFAULT 0.00,
  `min_quantity` decimal(10,2) DEFAULT NULL,
  `cost_price` decimal(10,2) DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `parent_item_id` int(11) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `is_manufactured` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `or_inventory_stocktaking`
--

DROP TABLE IF EXISTS `or_inventory_stocktaking`;
CREATE TABLE `or_inventory_stocktaking` (
  `id` int(11) NOT NULL,
  `status` enum('draft','completed') NOT NULL DEFAULT 'draft',
  `batch_id` varchar(50) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `completed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `or_inventory_stocktaking_drafts`
--

DROP TABLE IF EXISTS `or_inventory_stocktaking_drafts`;
CREATE TABLE `or_inventory_stocktaking_drafts` (
  `id` int(11) NOT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `or_inventory_stocktaking_draft_items`
--

DROP TABLE IF EXISTS `or_inventory_stocktaking_draft_items`;
CREATE TABLE `or_inventory_stocktaking_draft_items` (
  `id` int(11) NOT NULL,
  `draft_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `expected_quantity` decimal(10,2) NOT NULL,
  `actual_quantity` decimal(10,2) NOT NULL,
  `difference` decimal(10,2) NOT NULL,
  `notes` text DEFAULT NULL,
  `unit` varchar(50) DEFAULT NULL,
  `is_counted` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `or_inventory_stocktaking_items`
--

DROP TABLE IF EXISTS `or_inventory_stocktaking_items`;
CREATE TABLE `or_inventory_stocktaking_items` (
  `id` int(11) NOT NULL,
  `stocktaking_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `expected_quantity` decimal(10,2) NOT NULL,
  `actual_quantity` decimal(10,2) NOT NULL,
  `difference` decimal(10,2) NOT NULL,
  `notes` text DEFAULT NULL,
  `unit` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `or_item_audit_logs`
--

DROP TABLE IF EXISTS `or_item_audit_logs`;
CREATE TABLE `or_item_audit_logs` (
  `id` int(11) NOT NULL,
  `item_id` int(11) DEFAULT NULL,
  `user_id` int(11) NOT NULL,
  `action` varchar(50) NOT NULL,
  `changes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`changes`)),
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `password_change_requests`
--

DROP TABLE IF EXISTS `password_change_requests`;
CREATE TABLE `password_change_requests` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `new_password_hash` varchar(255) NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `requested_at` datetime DEFAULT current_timestamp(),
  `resolved_at` datetime DEFAULT NULL,
  `resolved_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `patients`
--

DROP TABLE IF EXISTS `patients`;
CREATE TABLE `patients` (
  `id` int(11) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `age` int(11) DEFAULT NULL,
  `gender` enum('male','female','other') DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `chronic_diseases` text DEFAULT NULL,
  `allergies` text DEFAULT NULL,
  `current_medications` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `created_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `prescriptions`
--

DROP TABLE IF EXISTS `prescriptions`;
CREATE TABLE `prescriptions` (
  `id` int(11) NOT NULL,
  `visit_id` int(11) NOT NULL,
  `patient_id` int(11) NOT NULL,
  `doctor_id` int(11) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `prescription_items`
--

DROP TABLE IF EXISTS `prescription_items`;
CREATE TABLE `prescription_items` (
  `id` int(11) NOT NULL,
  `prescription_id` int(11) NOT NULL,
  `medication_name` varchar(255) NOT NULL,
  `dosage` varchar(255) DEFAULT NULL,
  `duration` varchar(255) DEFAULT NULL,
  `instructions` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `frequency` varchar(255) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `radiology_categories`
--

DROP TABLE IF EXISTS `radiology_categories`;
CREATE TABLE `radiology_categories` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `radiology_tests`
--

DROP TABLE IF EXISTS `radiology_tests`;
CREATE TABLE `radiology_tests` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `category_id` int(11) DEFAULT NULL,
  `price_with_film` decimal(10,2) DEFAULT NULL,
  `price_without_film` decimal(10,2) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `rad_inventory_items`
--

DROP TABLE IF EXISTS `rad_inventory_items`;
CREATE TABLE `rad_inventory_items` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `film_type` enum('large','small','none') NOT NULL DEFAULT 'none',
  `unit` varchar(50) NOT NULL DEFAULT 'فيلم',
  `quantity` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `min_quantity` decimal(12,4) NOT NULL DEFAULT 5.0000,
  `cost_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `expiry_date` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `settings`
--

DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings` (
  `id` int(11) NOT NULL,
  `setting_key` varchar(50) NOT NULL,
  `setting_value` varchar(255) NOT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `surgeries`
--

DROP TABLE IF EXISTS `surgeries`;
CREATE TABLE `surgeries` (
  `id` int(11) NOT NULL,
  `visit_id` int(11) NOT NULL,
  `patient_id` int(11) NOT NULL,
  `surgery_type` varchar(100) NOT NULL,
  `full_price` decimal(10,2) NOT NULL,
  `currency` enum('YER','USD','SAR') NOT NULL DEFAULT 'YER',
  `discount_amount` decimal(10,2) DEFAULT 0.00,
  `discount_reason` varchar(255) DEFAULT NULL,
  `status` enum('planned','scheduled','ready','post_op','completed','cancelled') NOT NULL DEFAULT 'planned',
  `scheduled_date` datetime DEFAULT NULL,
  `completed_date` datetime DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `surgery_expenses`
--

DROP TABLE IF EXISTS `surgery_expenses`;
CREATE TABLE `surgery_expenses` (
  `id` int(11) NOT NULL,
  `surgery_id` int(11) NOT NULL,
  `description` varchar(255) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `created_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `surgery_materials_used`
--

DROP TABLE IF EXISTS `surgery_materials_used`;
CREATE TABLE `surgery_materials_used` (
  `id` int(11) NOT NULL,
  `surgery_id` int(11) NOT NULL,
  `inventory_item_id` int(11) NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `cost_price` decimal(10,2) NOT NULL,
  `issue_price` decimal(10,2) NOT NULL,
  `total_cost` decimal(10,2) GENERATED ALWAYS AS (`quantity` * `cost_price`) STORED,
  `total_issue` decimal(10,2) GENERATED ALWAYS AS (`quantity` * `issue_price`) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `surgery_payments`
--

DROP TABLE IF EXISTS `surgery_payments`;
CREATE TABLE `surgery_payments` (
  `id` int(11) NOT NULL,
  `surgery_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` enum('YER','USD','SAR') NOT NULL DEFAULT 'YER',
  `exchange_rate` decimal(10,2) NOT NULL DEFAULT 1.00,
  `payment_date` datetime DEFAULT current_timestamp(),
  `received_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `surgery_prep_items`
--

DROP TABLE IF EXISTS `surgery_prep_items`;
CREATE TABLE `surgery_prep_items` (
  `id` int(11) NOT NULL,
  `package_id` int(11) NOT NULL,
  `item_type` enum('lab','radiology') NOT NULL,
  `item_id` int(11) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `surgery_prep_packages`
--

DROP TABLE IF EXISTS `surgery_prep_packages`;
CREATE TABLE `surgery_prep_packages` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `users`
--

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `plain_password` varchar(255) DEFAULT NULL,
  `role` enum('doctor','secretary','cashier','lab','radiology','clinical','surgery_coordinator','or_store','general_store','auditor') NOT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `created_by` int(11) DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `must_change_password` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `vip_lab_requests`
--

DROP TABLE IF EXISTS `vip_lab_requests`;
CREATE TABLE `vip_lab_requests` (
  `id` int(11) NOT NULL,
  `vip_visit_id` int(11) NOT NULL,
  `lab_test_id` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` enum('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
  `result_notes` text DEFAULT NULL,
  `result_file` longtext DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `vip_radiology_requests`
--

DROP TABLE IF EXISTS `vip_radiology_requests`;
CREATE TABLE `vip_radiology_requests` (
  `id` int(11) NOT NULL,
  `vip_visit_id` int(11) NOT NULL,
  `radiology_test_id` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` enum('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
  `result_notes` text DEFAULT NULL,
  `result_file` longtext DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `vip_visits`
--

DROP TABLE IF EXISTS `vip_visits`;
CREATE TABLE `vip_visits` (
  `id` int(11) NOT NULL,
  `patient_name` varchar(255) NOT NULL,
  `patient_age` int(11) DEFAULT NULL,
  `doctor_id` int(11) NOT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `created_at` datetime DEFAULT current_timestamp(),
  `closed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `visits`
--

DROP TABLE IF EXISTS `visits`;
CREATE TABLE `visits` (
  `id` int(11) NOT NULL,
  `patient_id` int(11) NOT NULL,
  `visit_number` varchar(20) NOT NULL,
  `entity` enum('clinic','center') NOT NULL,
  `status` enum('registered','pending_payment','waiting','with_doctor','awaiting_service_payment','awaiting_lab','awaiting_radiology','completed_admin_pending_services','transferred_to_center','awaiting_surgery','post_surgery','completed','cancelled','follow_up') NOT NULL,
  `is_follow_up` tinyint(1) DEFAULT 0,
  `is_exempt` tinyint(1) NOT NULL DEFAULT 0,
  `visit_type` enum('initial','free_review','results_followup') NOT NULL DEFAULT 'initial',
  `previous_visit_id` int(11) DEFAULT NULL,
  `entry_fee` decimal(10,2) DEFAULT 0.00,
  `discount_amount` decimal(10,2) DEFAULT 0.00,
  `discount_reason` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `created_by` int(11) DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `is_exempted` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `visit_clinical_service_requests`
--

DROP TABLE IF EXISTS `visit_clinical_service_requests`;
CREATE TABLE `visit_clinical_service_requests` (
  `id` int(11) NOT NULL,
  `visit_id` int(11) NOT NULL,
  `service_id` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `discount_percentage` decimal(5,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `final_price` decimal(10,2) NOT NULL,
  `is_free` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('pending_payment','paid','completed','cancelled','refunded') NOT NULL DEFAULT 'pending_payment',
  `created_at` datetime DEFAULT current_timestamp(),
  `performed_at` datetime DEFAULT NULL,
  `performed_by` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `visit_lab_requests`
--

DROP TABLE IF EXISTS `visit_lab_requests`;
CREATE TABLE `visit_lab_requests` (
  `id` int(11) NOT NULL,
  `visit_id` int(11) NOT NULL,
  `lab_test_id` int(11) NOT NULL,
  `surgery_id` int(11) DEFAULT NULL,
  `is_included_in_surgery` tinyint(1) DEFAULT 0,
  `price` decimal(10,2) NOT NULL,
  `discount_percentage` decimal(5,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `final_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `is_free` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('pending_payment','paid','in_progress','result_uploaded','completed','cancelled','refunded') NOT NULL DEFAULT 'pending_payment',
  `result_file` longtext DEFAULT NULL,
  `result_notes` text DEFAULT NULL,
  `requested_by` int(11) DEFAULT NULL,
  `performed_by` int(11) DEFAULT NULL,
  `requested_at` datetime DEFAULT current_timestamp(),
  `performed_at` datetime DEFAULT NULL,
  `consumables_deducted` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `visit_radiology_films`
--

DROP TABLE IF EXISTS `visit_radiology_films`;
CREATE TABLE `visit_radiology_films` (
  `id` int(11) NOT NULL,
  `visit_id` int(11) NOT NULL,
  `film_size` enum('large','small','none') NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- بنية الجدول `visit_radiology_requests`
--

DROP TABLE IF EXISTS `visit_radiology_requests`;
CREATE TABLE `visit_radiology_requests` (
  `id` int(11) NOT NULL,
  `visit_id` int(11) NOT NULL,
  `radiology_test_id` int(11) NOT NULL,
  `surgery_id` int(11) DEFAULT NULL,
  `is_included_in_surgery` tinyint(1) DEFAULT 0,
  `with_film` tinyint(1) NOT NULL,
  `radiology_film_id` int(11) DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `discount_percentage` decimal(5,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `final_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `is_free` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('pending_payment','paid','in_progress','result_uploaded','completed','cancelled','refunded') NOT NULL DEFAULT 'pending_payment',
  `result_file` longtext DEFAULT NULL,
  `result_notes` text DEFAULT NULL,
  `requested_by` int(11) DEFAULT NULL,
  `performed_by` int(11) DEFAULT NULL,
  `requested_at` datetime DEFAULT current_timestamp(),
  `performed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `audit_log`
--
ALTER TABLE `audit_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `cash_shifts`
--
ALTER TABLE `cash_shifts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_opened_at` (`opened_at`);

--
-- Indexes for table `clinical_categories`
--
ALTER TABLE `clinical_categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `clinical_consumption_log`
--
ALTER TABLE `clinical_consumption_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_store` (`store`),
  ADD KEY `idx_visit` (`visit_id`),
  ADD KEY `idx_item` (`item_id`),
  ADD KEY `idx_performed_at` (`performed_at`),
  ADD KEY `idx_ccl_store_service_date` (`store`,`service_id`,`performed_at`);

--
-- Indexes for table `clinical_services`
--
ALTER TABLE `clinical_services`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`),
  ADD KEY `category_id` (`category_id`);

--
-- Indexes for table `doctor_favorites`
--
ALTER TABLE `doctor_favorites`
  ADD PRIMARY KEY (`id`),
  ADD KEY `doctor_id` (`doctor_id`);

--
-- Indexes for table `doctor_favorites_lab`
--
ALTER TABLE `doctor_favorites_lab`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_fav_lab` (`doctor_id`,`lab_test_id`),
  ADD KEY `lab_test_id` (`lab_test_id`);

--
-- Indexes for table `doctor_favorites_radiology`
--
ALTER TABLE `doctor_favorites_radiology`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_fav_rad` (`doctor_id`,`radiology_test_id`),
  ADD KEY `radiology_test_id` (`radiology_test_id`);

--
-- Indexes for table `doctor_favorite_bundles`
--
ALTER TABLE `doctor_favorite_bundles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `doctor_bundle_name` (`doctor_id`,`name`);

--
-- Indexes for table `doctor_favorite_bundle_items`
--
ALTER TABLE `doctor_favorite_bundle_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `bundle_item` (`bundle_id`,`test_id`,`test_type`);

--
-- Indexes for table `doctor_favorite_meds`
--
ALTER TABLE `doctor_favorite_meds`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `doctor_med` (`doctor_id`,`medication_name`);

--
-- Indexes for table `doctor_favorite_tests`
--
ALTER TABLE `doctor_favorite_tests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `doctor_test` (`doctor_id`,`test_id`,`test_type`);

--
-- Indexes for table `doctor_preferred_dosages`
--
ALTER TABLE `doctor_preferred_dosages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `doctor_id` (`doctor_id`);

--
-- Indexes for table `financial_transactions`
--
ALTER TABLE `financial_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `visit_id` (`visit_id`),
  ADD KEY `surgery_id` (`surgery_id`),
  ADD KEY `performed_by` (`performed_by`);

--
-- Indexes for table `general_inventory_items`
--
ALTER TABLE `general_inventory_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_name_unit` (`name`,`unit`);

--
-- Indexes for table `general_item_audit_logs`
--
ALTER TABLE `general_item_audit_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_item_id` (`item_id`),
  ADD KEY `idx_user_id` (`user_id`);

--
-- Indexes for table `inventory_stocktaking`
--
ALTER TABLE `inventory_stocktaking`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by` (`created_by`),
  ADD KEY `idx_stocktaking_status` (`store_type`,`status`,`created_at`);

--
-- Indexes for table `inventory_stocktaking_drafts`
--
ALTER TABLE `inventory_stocktaking_drafts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `inventory_stocktaking_draft_items`
--
ALTER TABLE `inventory_stocktaking_draft_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `draft_id` (`draft_id`),
  ADD KEY `item_id` (`item_id`);

--
-- Indexes for table `inventory_stocktaking_items`
--
ALTER TABLE `inventory_stocktaking_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `stocktaking_id` (`stocktaking_id`);

--
-- Indexes for table `inventory_transactions`
--
ALTER TABLE `inventory_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `performed_by` (`performed_by`),
  ADD KEY `idx_transactions_reference` (`reference_id`);

--
-- Indexes for table `inventory_transfers`
--
ALTER TABLE `inventory_transfers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `sent_by` (`sent_by`),
  ADD KEY `received_by` (`received_by`),
  ADD KEY `idx_transfers_batch_ref` (`batch_ref`);

--
-- Indexes for table `lab_categories`
--
ALTER TABLE `lab_categories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `parent_id` (`parent_id`);

--
-- Indexes for table `lab_inventory_items`
--
ALTER TABLE `lab_inventory_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_lab_inv_category` (`category`);

--
-- Indexes for table `lab_tests`
--
ALTER TABLE `lab_tests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `category_id` (`category_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `lab_test_consumables`
--
ALTER TABLE `lab_test_consumables`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_lab_test_item` (`lab_test_id`,`lab_item_id`),
  ADD KEY `idx_ltc_test` (`lab_test_id`),
  ADD KEY `idx_ltc_item` (`lab_item_id`);

--
-- Indexes for table `manufacturing_orders`
--
ALTER TABLE `manufacturing_orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `raw_item_id` (`raw_item_id`),
  ADD KEY `produced_item_id` (`produced_item_id`),
  ADD KEY `performed_by` (`performed_by`);

--
-- Indexes for table `medications`
--
ALTER TABLE `medications`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `or_inventory_items`
--
ALTER TABLE `or_inventory_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `parent_item_id` (`parent_item_id`);

--
-- Indexes for table `or_inventory_stocktaking`
--
ALTER TABLE `or_inventory_stocktaking`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `or_inventory_stocktaking_drafts`
--
ALTER TABLE `or_inventory_stocktaking_drafts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `or_inventory_stocktaking_draft_items`
--
ALTER TABLE `or_inventory_stocktaking_draft_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `draft_id` (`draft_id`),
  ADD KEY `item_id` (`item_id`);

--
-- Indexes for table `or_inventory_stocktaking_items`
--
ALTER TABLE `or_inventory_stocktaking_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `stocktaking_id` (`stocktaking_id`);

--
-- Indexes for table `or_item_audit_logs`
--
ALTER TABLE `or_item_audit_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_item_id` (`item_id`),
  ADD KEY `idx_user_id` (`user_id`);

--
-- Indexes for table `password_change_requests`
--
ALTER TABLE `password_change_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `resolved_by` (`resolved_by`);

--
-- Indexes for table `patients`
--
ALTER TABLE `patients`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `prescriptions`
--
ALTER TABLE `prescriptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `visit_id` (`visit_id`),
  ADD KEY `patient_id` (`patient_id`),
  ADD KEY `doctor_id` (`doctor_id`);

--
-- Indexes for table `prescription_items`
--
ALTER TABLE `prescription_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `prescription_id` (`prescription_id`);

--
-- Indexes for table `radiology_categories`
--
ALTER TABLE `radiology_categories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `parent_id` (`parent_id`);

--
-- Indexes for table `radiology_tests`
--
ALTER TABLE `radiology_tests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `category_id` (`category_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `rad_inventory_items`
--
ALTER TABLE `rad_inventory_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_film_type` (`film_type`);

--
-- Indexes for table `settings`
--
ALTER TABLE `settings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `setting_key` (`setting_key`),
  ADD KEY `updated_by` (`updated_by`);

--
-- Indexes for table `surgeries`
--
ALTER TABLE `surgeries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `visit_id` (`visit_id`),
  ADD KEY `patient_id` (`patient_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `surgery_expenses`
--
ALTER TABLE `surgery_expenses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `surgery_id` (`surgery_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `surgery_materials_used`
--
ALTER TABLE `surgery_materials_used`
  ADD PRIMARY KEY (`id`),
  ADD KEY `surgery_id` (`surgery_id`),
  ADD KEY `inventory_item_id` (`inventory_item_id`);

--
-- Indexes for table `surgery_payments`
--
ALTER TABLE `surgery_payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `surgery_id` (`surgery_id`),
  ADD KEY `received_by` (`received_by`);

--
-- Indexes for table `surgery_prep_items`
--
ALTER TABLE `surgery_prep_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `package_id` (`package_id`);

--
-- Indexes for table `surgery_prep_packages`
--
ALTER TABLE `surgery_prep_packages`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `vip_lab_requests`
--
ALTER TABLE `vip_lab_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vip_visit_id` (`vip_visit_id`),
  ADD KEY `lab_test_id` (`lab_test_id`);

--
-- Indexes for table `vip_radiology_requests`
--
ALTER TABLE `vip_radiology_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vip_visit_id` (`vip_visit_id`),
  ADD KEY `radiology_test_id` (`radiology_test_id`);

--
-- Indexes for table `vip_visits`
--
ALTER TABLE `vip_visits`
  ADD PRIMARY KEY (`id`),
  ADD KEY `doctor_id` (`doctor_id`);

--
-- Indexes for table `visits`
--
ALTER TABLE `visits`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `visit_number` (`visit_number`),
  ADD KEY `patient_id` (`patient_id`),
  ADD KEY `previous_visit_id` (`previous_visit_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `visit_clinical_service_requests`
--
ALTER TABLE `visit_clinical_service_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `visit_id` (`visit_id`),
  ADD KEY `service_id` (`service_id`);

--
-- Indexes for table `visit_lab_requests`
--
ALTER TABLE `visit_lab_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `visit_id` (`visit_id`),
  ADD KEY `lab_test_id` (`lab_test_id`),
  ADD KEY `surgery_id` (`surgery_id`),
  ADD KEY `requested_by` (`requested_by`),
  ADD KEY `performed_by` (`performed_by`);

--
-- Indexes for table `visit_radiology_films`
--
ALTER TABLE `visit_radiology_films`
  ADD PRIMARY KEY (`id`),
  ADD KEY `visit_id` (`visit_id`);

--
-- Indexes for table `visit_radiology_requests`
--
ALTER TABLE `visit_radiology_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `visit_id` (`visit_id`),
  ADD KEY `radiology_test_id` (`radiology_test_id`),
  ADD KEY `surgery_id` (`surgery_id`),
  ADD KEY `requested_by` (`requested_by`),
  ADD KEY `performed_by` (`performed_by`),
  ADD KEY `fk_vrr_film` (`radiology_film_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `audit_log`
--
ALTER TABLE `audit_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cash_shifts`
--
ALTER TABLE `cash_shifts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `clinical_categories`
--
ALTER TABLE `clinical_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `clinical_consumption_log`
--
ALTER TABLE `clinical_consumption_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `clinical_services`
--
ALTER TABLE `clinical_services`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `doctor_favorites`
--
ALTER TABLE `doctor_favorites`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `doctor_favorites_lab`
--
ALTER TABLE `doctor_favorites_lab`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `doctor_favorites_radiology`
--
ALTER TABLE `doctor_favorites_radiology`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `doctor_favorite_bundles`
--
ALTER TABLE `doctor_favorite_bundles`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `doctor_favorite_bundle_items`
--
ALTER TABLE `doctor_favorite_bundle_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `doctor_favorite_meds`
--
ALTER TABLE `doctor_favorite_meds`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `doctor_favorite_tests`
--
ALTER TABLE `doctor_favorite_tests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `doctor_preferred_dosages`
--
ALTER TABLE `doctor_preferred_dosages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `financial_transactions`
--
ALTER TABLE `financial_transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `general_inventory_items`
--
ALTER TABLE `general_inventory_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `general_item_audit_logs`
--
ALTER TABLE `general_item_audit_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventory_stocktaking`
--
ALTER TABLE `inventory_stocktaking`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventory_stocktaking_drafts`
--
ALTER TABLE `inventory_stocktaking_drafts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventory_stocktaking_draft_items`
--
ALTER TABLE `inventory_stocktaking_draft_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventory_stocktaking_items`
--
ALTER TABLE `inventory_stocktaking_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventory_transactions`
--
ALTER TABLE `inventory_transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventory_transfers`
--
ALTER TABLE `inventory_transfers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lab_categories`
--
ALTER TABLE `lab_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lab_inventory_items`
--
ALTER TABLE `lab_inventory_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lab_tests`
--
ALTER TABLE `lab_tests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lab_test_consumables`
--
ALTER TABLE `lab_test_consumables`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `manufacturing_orders`
--
ALTER TABLE `manufacturing_orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `medications`
--
ALTER TABLE `medications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `or_inventory_items`
--
ALTER TABLE `or_inventory_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `or_inventory_stocktaking`
--
ALTER TABLE `or_inventory_stocktaking`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `or_inventory_stocktaking_drafts`
--
ALTER TABLE `or_inventory_stocktaking_drafts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `or_inventory_stocktaking_draft_items`
--
ALTER TABLE `or_inventory_stocktaking_draft_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `or_inventory_stocktaking_items`
--
ALTER TABLE `or_inventory_stocktaking_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `or_item_audit_logs`
--
ALTER TABLE `or_item_audit_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `password_change_requests`
--
ALTER TABLE `password_change_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `patients`
--
ALTER TABLE `patients`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `prescriptions`
--
ALTER TABLE `prescriptions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `prescription_items`
--
ALTER TABLE `prescription_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `radiology_categories`
--
ALTER TABLE `radiology_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `radiology_tests`
--
ALTER TABLE `radiology_tests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `rad_inventory_items`
--
ALTER TABLE `rad_inventory_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `settings`
--
ALTER TABLE `settings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `surgeries`
--
ALTER TABLE `surgeries`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `surgery_expenses`
--
ALTER TABLE `surgery_expenses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `surgery_materials_used`
--
ALTER TABLE `surgery_materials_used`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `surgery_payments`
--
ALTER TABLE `surgery_payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `surgery_prep_items`
--
ALTER TABLE `surgery_prep_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `surgery_prep_packages`
--
ALTER TABLE `surgery_prep_packages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vip_lab_requests`
--
ALTER TABLE `vip_lab_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vip_radiology_requests`
--
ALTER TABLE `vip_radiology_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vip_visits`
--
ALTER TABLE `vip_visits`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `visits`
--
ALTER TABLE `visits`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `visit_clinical_service_requests`
--
ALTER TABLE `visit_clinical_service_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `visit_lab_requests`
--
ALTER TABLE `visit_lab_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `visit_radiology_films`
--
ALTER TABLE `visit_radiology_films`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `visit_radiology_requests`
--
ALTER TABLE `visit_radiology_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- قيود الجداول المُلقاة.
--

--
-- قيود الجداول `audit_log`
--
ALTER TABLE `audit_log`
  ADD CONSTRAINT `audit_log_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `clinical_services`
--
ALTER TABLE `clinical_services`
  ADD CONSTRAINT `clinical_services_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `clinical_categories` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `doctor_favorites`
--
ALTER TABLE `doctor_favorites`
  ADD CONSTRAINT `doctor_favorites_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `doctor_favorites_lab`
--
ALTER TABLE `doctor_favorites_lab`
  ADD CONSTRAINT `doctor_favorites_lab_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `doctor_favorites_lab_ibfk_2` FOREIGN KEY (`lab_test_id`) REFERENCES `lab_tests` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `doctor_favorites_radiology`
--
ALTER TABLE `doctor_favorites_radiology`
  ADD CONSTRAINT `doctor_favorites_radiology_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `doctor_favorites_radiology_ibfk_2` FOREIGN KEY (`radiology_test_id`) REFERENCES `radiology_tests` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `doctor_favorite_bundles`
--
ALTER TABLE `doctor_favorite_bundles`
  ADD CONSTRAINT `doctor_favorite_bundles_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `doctor_favorite_bundle_items`
--
ALTER TABLE `doctor_favorite_bundle_items`
  ADD CONSTRAINT `doctor_favorite_bundle_items_ibfk_1` FOREIGN KEY (`bundle_id`) REFERENCES `doctor_favorite_bundles` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `doctor_favorite_meds`
--
ALTER TABLE `doctor_favorite_meds`
  ADD CONSTRAINT `doctor_favorite_meds_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `doctor_favorite_tests`
--
ALTER TABLE `doctor_favorite_tests`
  ADD CONSTRAINT `doctor_favorite_tests_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `doctor_preferred_dosages`
--
ALTER TABLE `doctor_preferred_dosages`
  ADD CONSTRAINT `doctor_preferred_dosages_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `financial_transactions`
--
ALTER TABLE `financial_transactions`
  ADD CONSTRAINT `financial_transactions_ibfk_1` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `financial_transactions_ibfk_2` FOREIGN KEY (`surgery_id`) REFERENCES `surgeries` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `financial_transactions_ibfk_3` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `general_item_audit_logs`
--
ALTER TABLE `general_item_audit_logs`
  ADD CONSTRAINT `general_item_audit_logs_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `general_inventory_items` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `general_item_audit_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `inventory_stocktaking`
--
ALTER TABLE `inventory_stocktaking`
  ADD CONSTRAINT `inventory_stocktaking_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `inventory_stocktaking_drafts`
--
ALTER TABLE `inventory_stocktaking_drafts`
  ADD CONSTRAINT `inv_stk_drafts_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `inventory_stocktaking_draft_items`
--
ALTER TABLE `inventory_stocktaking_draft_items`
  ADD CONSTRAINT `inv_stk_draft_items_ibfk_1` FOREIGN KEY (`draft_id`) REFERENCES `inventory_stocktaking_drafts` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `inv_stk_draft_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `general_inventory_items` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `inventory_stocktaking_items`
--
ALTER TABLE `inventory_stocktaking_items`
  ADD CONSTRAINT `inventory_stocktaking_items_ibfk_1` FOREIGN KEY (`stocktaking_id`) REFERENCES `inventory_stocktaking` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `inventory_transactions`
--
ALTER TABLE `inventory_transactions`
  ADD CONSTRAINT `inventory_transactions_ibfk_1` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `inventory_transfers`
--
ALTER TABLE `inventory_transfers`
  ADD CONSTRAINT `inventory_transfers_ibfk_1` FOREIGN KEY (`sent_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `inventory_transfers_ibfk_2` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `lab_categories`
--
ALTER TABLE `lab_categories`
  ADD CONSTRAINT `lab_categories_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `lab_categories` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `lab_tests`
--
ALTER TABLE `lab_tests`
  ADD CONSTRAINT `lab_tests_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `lab_categories` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `lab_tests_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `lab_test_consumables`
--
ALTER TABLE `lab_test_consumables`
  ADD CONSTRAINT `fk_ltc_lab_item` FOREIGN KEY (`lab_item_id`) REFERENCES `lab_inventory_items` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ltc_lab_test` FOREIGN KEY (`lab_test_id`) REFERENCES `lab_tests` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `manufacturing_orders`
--
ALTER TABLE `manufacturing_orders`
  ADD CONSTRAINT `manufacturing_orders_ibfk_1` FOREIGN KEY (`raw_item_id`) REFERENCES `or_inventory_items` (`id`),
  ADD CONSTRAINT `manufacturing_orders_ibfk_2` FOREIGN KEY (`produced_item_id`) REFERENCES `or_inventory_items` (`id`),
  ADD CONSTRAINT `manufacturing_orders_ibfk_3` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `or_inventory_items`
--
ALTER TABLE `or_inventory_items`
  ADD CONSTRAINT `or_inventory_items_ibfk_1` FOREIGN KEY (`parent_item_id`) REFERENCES `or_inventory_items` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `or_inventory_stocktaking`
--
ALTER TABLE `or_inventory_stocktaking`
  ADD CONSTRAINT `or_stocktaking_users_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- قيود الجداول `or_inventory_stocktaking_drafts`
--
ALTER TABLE `or_inventory_stocktaking_drafts`
  ADD CONSTRAINT `or_stk_drafts_users_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- قيود الجداول `or_inventory_stocktaking_draft_items`
--
ALTER TABLE `or_inventory_stocktaking_draft_items`
  ADD CONSTRAINT `or_stk_draft_items_fk1` FOREIGN KEY (`draft_id`) REFERENCES `or_inventory_stocktaking_drafts` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `or_stk_draft_items_fk2` FOREIGN KEY (`item_id`) REFERENCES `or_inventory_items` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `or_inventory_stocktaking_items`
--
ALTER TABLE `or_inventory_stocktaking_items`
  ADD CONSTRAINT `or_stocktaking_items_fk` FOREIGN KEY (`stocktaking_id`) REFERENCES `or_inventory_stocktaking` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `or_item_audit_logs`
--
ALTER TABLE `or_item_audit_logs`
  ADD CONSTRAINT `or_item_audit_logs_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `or_inventory_items` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `or_item_audit_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `password_change_requests`
--
ALTER TABLE `password_change_requests`
  ADD CONSTRAINT `password_change_requests_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `password_change_requests_ibfk_2` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `patients`
--
ALTER TABLE `patients`
  ADD CONSTRAINT `patients_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `prescriptions`
--
ALTER TABLE `prescriptions`
  ADD CONSTRAINT `prescriptions_ibfk_1` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `prescriptions_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `prescriptions_ibfk_3` FOREIGN KEY (`doctor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `prescription_items`
--
ALTER TABLE `prescription_items`
  ADD CONSTRAINT `prescription_items_ibfk_1` FOREIGN KEY (`prescription_id`) REFERENCES `prescriptions` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `radiology_categories`
--
ALTER TABLE `radiology_categories`
  ADD CONSTRAINT `radiology_categories_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `radiology_categories` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `radiology_tests`
--
ALTER TABLE `radiology_tests`
  ADD CONSTRAINT `radiology_tests_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `radiology_categories` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `radiology_tests_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `settings`
--
ALTER TABLE `settings`
  ADD CONSTRAINT `settings_ibfk_1` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `surgeries`
--
ALTER TABLE `surgeries`
  ADD CONSTRAINT `surgeries_ibfk_1` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `surgeries_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  ADD CONSTRAINT `surgeries_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `surgery_expenses`
--
ALTER TABLE `surgery_expenses`
  ADD CONSTRAINT `surgery_expenses_ibfk_1` FOREIGN KEY (`surgery_id`) REFERENCES `surgeries` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `surgery_expenses_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `surgery_materials_used`
--
ALTER TABLE `surgery_materials_used`
  ADD CONSTRAINT `surgery_materials_used_ibfk_1` FOREIGN KEY (`surgery_id`) REFERENCES `surgeries` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `surgery_materials_used_ibfk_2` FOREIGN KEY (`inventory_item_id`) REFERENCES `or_inventory_items` (`id`);

--
-- قيود الجداول `surgery_payments`
--
ALTER TABLE `surgery_payments`
  ADD CONSTRAINT `surgery_payments_ibfk_1` FOREIGN KEY (`surgery_id`) REFERENCES `surgeries` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `surgery_payments_ibfk_2` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `surgery_prep_items`
--
ALTER TABLE `surgery_prep_items`
  ADD CONSTRAINT `surgery_prep_items_ibfk_1` FOREIGN KEY (`package_id`) REFERENCES `surgery_prep_packages` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `vip_lab_requests`
--
ALTER TABLE `vip_lab_requests`
  ADD CONSTRAINT `vip_lab_requests_ibfk_1` FOREIGN KEY (`vip_visit_id`) REFERENCES `vip_visits` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `vip_lab_requests_ibfk_2` FOREIGN KEY (`lab_test_id`) REFERENCES `lab_tests` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `vip_radiology_requests`
--
ALTER TABLE `vip_radiology_requests`
  ADD CONSTRAINT `vip_radiology_requests_ibfk_1` FOREIGN KEY (`vip_visit_id`) REFERENCES `vip_visits` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `vip_radiology_requests_ibfk_2` FOREIGN KEY (`radiology_test_id`) REFERENCES `radiology_tests` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `vip_visits`
--
ALTER TABLE `vip_visits`
  ADD CONSTRAINT `vip_visits_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `visits`
--
ALTER TABLE `visits`
  ADD CONSTRAINT `visits_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  ADD CONSTRAINT `visits_ibfk_2` FOREIGN KEY (`previous_visit_id`) REFERENCES `visits` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `visits_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `visit_clinical_service_requests`
--
ALTER TABLE `visit_clinical_service_requests`
  ADD CONSTRAINT `visit_clinical_service_requests_ibfk_1` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `visit_clinical_service_requests_ibfk_2` FOREIGN KEY (`service_id`) REFERENCES `clinical_services` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `visit_lab_requests`
--
ALTER TABLE `visit_lab_requests`
  ADD CONSTRAINT `visit_lab_requests_ibfk_1` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `visit_lab_requests_ibfk_2` FOREIGN KEY (`lab_test_id`) REFERENCES `lab_tests` (`id`),
  ADD CONSTRAINT `visit_lab_requests_ibfk_3` FOREIGN KEY (`surgery_id`) REFERENCES `surgeries` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `visit_lab_requests_ibfk_4` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `visit_lab_requests_ibfk_5` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- قيود الجداول `visit_radiology_films`
--
ALTER TABLE `visit_radiology_films`
  ADD CONSTRAINT `visit_radiology_films_ibfk_1` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE;

--
-- قيود الجداول `visit_radiology_requests`
--
ALTER TABLE `visit_radiology_requests`
  ADD CONSTRAINT `fk_vrr_film` FOREIGN KEY (`radiology_film_id`) REFERENCES `visit_radiology_films` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `visit_radiology_requests_ibfk_1` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `visit_radiology_requests_ibfk_2` FOREIGN KEY (`radiology_test_id`) REFERENCES `radiology_tests` (`id`),
  ADD CONSTRAINT `visit_radiology_requests_ibfk_3` FOREIGN KEY (`surgery_id`) REFERENCES `surgeries` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `visit_radiology_requests_ibfk_4` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `visit_radiology_requests_ibfk_5` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
