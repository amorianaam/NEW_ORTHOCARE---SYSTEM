// ═══════════════════════════════════════════════════════════════════
// Prescription Print Utility (Matching InvoicePrintModal Visual Design & Layout)
// Exact match with Cashier Invoice: A5 Landscape, Smart Proportions, Clinic Branding
// ═══════════════════════════════════════════════════════════════════
import { CLINIC_LOGO_BASE64 } from '../assets/clinicLogo';

const formatDateEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatTimeEn = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => n.toString().padStart(2, '0');
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${pad(hours)}:${minutes} ${ampm}`;
};

export const printPrescription = ({ patient, visit, items = [], onAfterPrint }) => {
  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
    return;
  }

  const now = new Date();
  const rxNumber = `RX-${visit?.visit_number || visit?.id || '000'}`;
  const patientName = patient?.full_name || visit?.full_name || '—';
  const logoSrc = CLINIC_LOGO_BASE64;

  // Vector SVG Icons for high-precision print output without emoji artifacts
  const svgPhone = `<svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:2px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
  const svgMobile = `<svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:2px;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`;
  const svgMail = `<svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:2px;"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`;
  const svgPin = `<svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:3px;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;

  // Standardize prescription items
  let prescriptionList = [];
  if (Array.isArray(items)) {
    prescriptionList = items;
  } else if (typeof items === 'string' && items.trim()) {
    prescriptionList = [{ medication_name: items, dosage: '—', frequency: '—', instructions: '—', duration: '—' }];
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
      <head>
        <base href="${typeof window !== 'undefined' && window.location?.origin ? `${window.location.origin}/` : '/'}" />
        <meta charset="utf-8" />
        <title>الروشتة الطبية - ${patientName}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
          
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #0f172a;
            background: #f1f5f9;
            direction: rtl;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          @page {
            size: A5 landscape;
            margin: 0;
          }

          .prescription-sheet {
            width: 210mm;
            height: 148mm;
            max-height: 148mm;
            margin: 0 auto;
            padding: 6mm 8mm 5mm 8mm;
            background: #ffffff;
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
          }

          /* Watermark Background */
          .watermark-container {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            z-index: 1;
            opacity: 0.045;
          }

          .watermark-img {
            width: 320px;
            height: auto;
            filter: grayscale(10%);
          }

          /* Top Header Banner matching InvoicePrintModal */
          .prescription-header {
            display: flex;
            flex-direction: column;
            align-items: center;
            border-bottom: 2px solid #0284c7;
            padding-bottom: 3.5px;
            margin-bottom: 2px;
            position: relative;
            z-index: 2;
          }

          .clinic-top-bar {
            width: 100%;
            text-align: center;
            margin-bottom: 2.5px;
          }

          .clinic-main-title {
            font-size: 15px;
            font-weight: 900;
            color: #0c4a6e;
            line-height: 1.2;
            letter-spacing: -0.2px;
          }

          .header-body {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .doctor-side {
            width: 31%;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }

          .doctor-name {
            font-size: 12px;
            font-weight: 900;
            color: #0c4a6e;
            margin-bottom: 1.5px;
            line-height: 1.2;
          }

          .doctor-spec {
            font-size: 9px;
            font-weight: 700;
            color: #334155;
            line-height: 1.3;
            margin: 0;
          }

          .clinic-center {
            width: 38%;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }

          .logo-wrap {
            width: 66px;
            height: 66px;
            margin-bottom: 2px;
          }

          .clinic-logo {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }

          .badge-wrapper {
            display: flex;
            justify-content: center;
          }

          .prescription-badge {
            display: inline-block;
            background: #0284c7;
            color: #ffffff;
            font-size: 8.5px;
            font-weight: 800;
            padding: 1.5px 8px;
            border-radius: 9999px;
            letter-spacing: 0.2px;
            white-space: nowrap;
          }

          /* Patient Meta Strip matching Invoice (Name, Rx No, Date - No Age/Gender) */
          .patient-strip {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 4px 10px;
            margin-top: 4px;
            margin-bottom: 4px;
            position: relative;
            z-index: 2;
          }

          .meta-item {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
          }

          .meta-label {
            font-weight: 700;
            color: #475569;
          }

          .meta-value {
            font-weight: 800;
            color: #0f172a;
          }

          .meta-value.patient-name {
            color: #0369a1;
            font-size: 11px;
          }

          .meta-value.rx-no {
            color: #0284c7;
          }

          /* Table with Smart Proportions */
          .table-container {
            flex: 1;
            position: relative;
            z-index: 2;
            overflow: hidden;
            margin-top: 2px;
          }

          .items-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            font-size: 9.5px;
          }

          .items-table th {
            background: #f1f5f9;
            color: #1e293b;
            font-weight: 800;
            padding: 4px 6px;
            border-top: 1px solid #cbd5e1;
            border-bottom: 1.5px solid #0284c7;
            font-size: 9px;
          }

          .items-table td {
            padding: 4.5px 6px;
            border-bottom: 1px solid #f1f5f9;
            color: #1e293b;
            vertical-align: middle;
          }

          .items-table tbody tr:nth-child(even) {
            background: #fafbfc;
          }

          .med-name {
            font-weight: 700;
            color: #0f172a;
          }

          /* Footer Contact & Address Section (Exact Match to Invoice) */
          .invoice-footer {
            background: transparent;
            color: #1e293b;
            padding: 0;
            margin-top: 6px;
            text-align: center;
            position: relative;
            z-index: 2;
          }

          .footer-address {
            font-size: 8.5px;
            font-weight: 800;
            color: #0f2b48;
            margin-bottom: 2.5px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
          }

          .footer-line {
            border: none;
            border-top: 1px solid #cbd5e1;
            margin: 2.5px auto;
            width: 98%;
          }

          .footer-contacts {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 8px;
            font-weight: 700;
            color: #475569;
            direction: ltr;
          }

          .footer-sep {
            color: #94a3b8;
            font-weight: 300;
          }
        </style>
      </head>
      <body>
        <div class="prescription-sheet">
          <!-- Watermark Background -->
          <div class="watermark-container">
            <img src="${logoSrc}" alt="watermark" class="watermark-img" />
          </div>

          <!-- Top Header Banner matching Invoice -->
          <header class="prescription-header">
            <div class="clinic-top-bar">
              <h1 class="clinic-main-title">مركز الدكتور أحمد أنعم لجراحة العظام والمفاصل والتشوهات</h1>
            </div>

            <div class="header-body">
              <div class="doctor-side doctor-right">
                <h3 class="doctor-name">إشراف د/ أحمد أنعم</h3>
                <p class="doctor-spec">إستشاري أمراض</p>
                <p class="doctor-spec">وجراحة العظام والمفاصل</p>
              </div>

              <div class="clinic-center">
                <div class="logo-wrap">
                  <img src="${logoSrc}" alt="شعار المركز" class="clinic-logo" />
                </div>
                <div class="badge-wrapper">
                  <span class="prescription-badge">الوصفة الطبية</span>
                </div>
              </div>

              <div class="doctor-side doctor-left">
                <h3 class="doctor-name">د/ هيثم أنعم</h3>
                <p class="doctor-spec">إستشاري أمراض</p>
                <p class="doctor-spec">وجراحة العظام والمفاصل</p>
              </div>
            </div>
          </header>

          <!-- Patient Meta Strip (Matching Invoice: Patient Name, Rx No, Date - No Age/Gender) -->
          <section class="patient-strip">
            <div class="meta-item">
              <span class="meta-label">اسم المريض:</span>
              <span class="meta-value patient-name">${patientName}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">رقم الروشتة:</span>
              <span class="meta-value rx-no" dir="ltr">${rxNumber}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">تاريخ الطباعة:</span>
              <span class="meta-value" dir="ltr">${formatDateEn(now)}</span>
            </div>
          </section>

          <!-- Medications Table (Proportional Layout: 5%, 30%, 15%, 15%, 20%, 15%) -->
          <main class="table-container">
            <table class="items-table">
              <colgroup>
                <col style="width: 5%;">
                <col style="width: 30%;">
                <col style="width: 15%;">
                <col style="width: 15%;">
                <col style="width: 20%;">
                <col style="width: 15%;">
              </colgroup>
              <thead>
                <tr>
                  <th style="text-align: center;">#</th>
                  <th style="text-align: right;">اسم الدواء والعلاج</th>
                  <th style="text-align: center;">الجرعة</th>
                  <th style="text-align: center;">التكرار</th>
                  <th style="text-align: center;">التعليمات</th>
                  <th style="text-align: center;">المدة</th>
                </tr>
              </thead>
              <tbody>
                ${prescriptionList.length === 0 ? `
                  <tr><td colspan="6" style="text-align: center; padding: 25px; color: #94a3b8; font-weight: bold;">لا توجد أدوية مسجلة في هذه الروشتة</td></tr>
                ` : prescriptionList.map((item, idx) => `
                  <tr>
                    <td style="text-align: center; font-weight: bold; color: #64748b;">${idx + 1}</td>
                    <td style="font-weight: 700; color: #0f172a;">${item.medication_name || item.name || '—'}</td>
                    <td style="text-align: center; font-weight: 700; color: #334155;">${item.dosage || '—'}</td>
                    <td style="text-align: center; font-weight: 700; color: #334155;">${item.frequency || '—'}</td>
                    <td style="text-align: center; font-weight: 600; color: #475569;">${item.instructions || '—'}</td>
                    <td style="text-align: center; font-weight: 700; color: #334155; white-space: nowrap;">${item.duration || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </main>

          <!-- Footer Contact & Address Section (Exact Match to Invoice) -->
          <footer class="invoice-footer">
            <div class="footer-address">
              <span>${svgPin} الجمهورية اليمنية - تعز- شارع جمال - مقابل مطعم السعيد - فوق (الصيدلية المركزية).</span>
            </div>
            <hr class="footer-line" />
            <div class="footer-contacts">
              <span dir="ltr">&#x200E;${svgPhone} 04-263750</span>
              <span class="footer-sep">|</span>
              <span dir="ltr">&#x200E;${svgPhone} 04-266150</span>
              <span class="footer-sep">|</span>
              <span dir="ltr">&#x200E;${svgMobile} +967 737714264</span>
              <span class="footer-sep">|</span>
              <span dir="ltr">${svgMail} dranaam2007@yahoo.com</span>
            </div>
          </footer>
        </div>

        <script>
          window.addEventListener('load', () => {
            setTimeout(() => {
              window.print();
              setTimeout(() => {
                try { window.close(); } catch(e) {}
              }, 400);
            }, 300);
          });
          window.onafterprint = () => {
            try { window.close(); } catch(e) {}
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();

  if (typeof onAfterPrint === 'function') {
    const timer = setInterval(() => {
      if (printWindow.closed) {
        clearInterval(timer);
        onAfterPrint();
      }
    }, 400);
  }
};

export default printPrescription;
