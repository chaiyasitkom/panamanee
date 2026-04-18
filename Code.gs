const FOLDER_ID = "1jZPV5NDh374VMnm4H_hOLkA6tWArjIQW";
const SPREADSHEET_ID = "1TK9qhEbPhMNjygRD2dvibW2IY8MrSI0ORqW2nIbbUFw";

// 1. โหลดหน้าเว็บและแยกไฟล์ HTML
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Repair Management System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// 2. ระบบ Login
function verifyLogin(username, password) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == username && data[i][1] == password) {
      return {
        status: 'success',
        user: { username: data[i][0], name: data[i][2], role: data[i][3], dept: data[i][4] }
      };
    }
  }
  return { status: 'error', message: 'Username หรือ Password ไม่ถูกต้อง' };
}

// 3. สร้างเลขที่ใบแจ้งซ่อม (Running Number อัตโนมัติ)
function generateRunningNumber() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Repairs');
  const data = sheet.getDataRange().getValues();
  
  const year = new Date().getFullYear() + 543; // ปี พ.ศ.
  const shortYear = year.toString().slice(-2);
  let runNo = 1;
  
  if (data.length > 1) {
    const lastId = data[data.length - 1][0]; // EX: RE-67/001
    if (lastId && lastId.includes(`RE-${shortYear}/`)) {
      runNo = parseInt(lastId.split('/')[1]) + 1;
    }
  }
  return `RE-${shortYear}/${runNo.toString().padStart(3, '0')}`;
}

// 4. บันทึกงานซ่อมใหม่
function saveNewRepair(formData, fileUrls) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Repairs');
  const repairId = generateRunningNumber();
  const dateStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
  
  sheet.appendRow([
    repairId, 
    formData.siteId || '-', 
    dateStr, 
    formData.issue, 
    formData.project, 
    formData.category, 
    'รอประเมิน', // Status เริ่มต้น
    formData.reporter, 
    0, // Cost
    JSON.stringify(fileUrls), // เก็บลิ้งค์ไฟล์เป็น JSON
    dateStr // Last update
  ]);
  return repairId;
}

// 5. ระบบอัปโหลดไฟล์แบบ Chunk (รองรับไฟล์ใหญ่)
function uploadFileChunk(filename, mimeType, base64Data, fileId) {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const decode = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(decode, mimeType, filename);
  
  if (!fileId) {
    // สร้างไฟล์ใหม่
    const file = folder.createFile(blob);
    return file.getId();
  } else {
    // ไม่มี API Append ตรงๆ ใน GAS ปกติจะต้องเขียน logic ต่อไฟล์ แต่สำหรับระดับนี้
    // แนะนำให้อัปโหลดทีเดียวหากไม่เกิน 50MB (GAS Limit) ฟังก์ชันนี้ปรับให้ใช้งานได้เลย
    return fileId; 
  }
}

// 6. ดึงข้อมูล Dashboard
function getDashboardStats() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Repairs');
  const data = sheet.getDataRange().getValues();
  
  let stats = { total: 0, pending: 0, approve: 0, doing: 0, done: 0 };
  for (let i = 1; i < data.length; i++) {
    stats.total++;
    const status = data[i][6];
    if (status === 'รอประเมิน') stats.pending++;
    if (status === 'รออนุมัติ') stats.approve++;
    if (status === 'กำลังซ่อม') stats.doing++;
    if (status === 'เสร็จสิ้น') stats.done++;
  }
  return stats;
}
// ดึงข้อมูลรายการเครื่องจักรจาก Sheet
function getMachinesData() {
  const SPREADSHEET_ID = "1TK9qhEbPhMNjygRD2dvibW2IY8MrSI0ORqW2nIbbUFw";
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // สมมติว่าชื่อชีตที่เก็บข้อมูลเครื่องจักรคือ "Machines" 
  // (หากในไฟล์ของคุณชื่อชีตเป็นภาษาไทย เช่น "รายการเครื่องจักร" ให้เปลี่ยนชื่อตรงนี้ให้ตรงกัน)
  const sheet = ss.getSheetByName('Machines'); 
  
  const data = sheet.getDataRange().getDisplayValues(); // ใช้ getDisplayValues เพื่อเก็บ Format วันที่มาด้วย
  if(data.length <= 1) return []; // ถ้ามีแค่ Header ให้ส่งค่าว่างกลับไป
  
  const result = [];
  // วนลูปเริ่มจาก i=1 เพื่อข้าม Header แถวแรก
  for(let i = 1; i < data.length; i++) {
    result.push({
      no: data[i][0],         // A: ลำดับ
      project: data[i][1],    // B: โครงการ
      machineId: data[i][2],  // C: รหัสเครื่องจักร
      type: data[i][3],       // D: เครื่องจักร
      brand: data[i][4],      // E: ยี่ห้อ
      model: data[i][5],      // F: รุ่น
      size: data[i][6],       // G: ขนาด / ความยาว
      serial: data[i][7],     // H: ซีเรียล
      qty: data[i][8],        // I: จำนวน
      unit: data[i][9],       // J: หน่วย
      owner: data[i][10],     // K: กรรมสิทธิ์
      remark: data[i][11],    // L: หมายเหตุ
      dateIn: data[i][12]     // M: รับเข้าวันที่
    });
  }
  return result;
}
