const login = require("@dongdev/fca-unofficial");
const fs = require("fs");
const puppeteer = require("puppeteer");
const Jimp = require("jimp");
const QrCode = require("qrcode-reader");

const appState = JSON.parse(fs.readFileSync("appstate.json", "utf8"));
const claimingPhoneNumber = "0996327837";
const processedMsg = new Set();

async function redeemAngpaoPuppeteer(voucherHash, phone) {
  const url = `https://gift.truemoney.com/campaign/vouchers/${voucherHash}/redeem`;
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  await page.goto(`https://gift.truemoney.com/campaign/?v=${voucherHash}`, { waitUntil: "networkidle2", timeout: 10000 });

  const result = await page.evaluate(async (url, phone, voucherHash) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mobile: phone, voucher_hash: voucherHash })
    });
    return await res.json();
  }, url, phone, voucherHash);

  await browser.close();
  return result;
}

login({ appState }, (err, api) => {
  if (err) return console.error("Login error:", err);

  api.listenMqtt(async (err, event) => {
    if (err) return console.error("Listen error:", err);

    if (!event.messageID || processedMsg.has(event.messageID)) return;
    processedMsg.add(event.messageID);

    if (event.type === "message" && event.body) {
      const match = event.body.match(/v=([0-9A-Za-z]{35})/);
      if (!match) return;
      const voucherHash = match[1];
      api.sendMessage("รับคำขอแล้ว กำลังดำเนินการ...", event.threadID);
      try {
        const result = await redeemAngpaoPuppeteer(voucherHash, claimingPhoneNumber);
        if (result?.status?.code === "SUCCESS") {
          const amount = result?.data?.my_ticket?.amount_baht;
          api.sendMessage(`รับอั่งเปาสำเร็จ: ${amount} บาท`, event.threadID);
        } else {
          api.sendMessage(`ไม่สำเร็จ: ${result?.status?.message || "Unknown error"}`, event.threadID);
        }
      } catch (e) {
        api.sendMessage("เกิดข้อผิดพลาด puppeteer หรือ network", event.threadID);
      }
    }

    if (event.attachments && event.attachments.length > 0) {
      for (let file of event.attachments) {
        if (file.type === "photo") {
          try {
            const image = await Jimp.read(file.url);
            const qr = new QrCode();
            qr.callback = async function (err, value) {
              if (err || !value) {
                api.sendMessage("ถอด QR ไม่สำเร็จ", event.threadID);
                return;
              }
              const found = value.result.match(/v=([0-9A-Za-z]{35})/);
              if (found) {
                const voucherHash = found[1];
                api.sendMessage("รับ QR แล้ว กำลังดำเนินการ...", event.threadID);
                try {
                  const result = await redeemAngpaoPuppeteer(voucherHash, claimingPhoneNumber);
                  if (result?.status?.code === "SUCCESS") {
                    const amount = result?.data?.my_ticket?.amount_baht;
                    api.sendMessage(`รับอั่งเปาสำเร็จ: ${amount} บาท`, event.threadID);
                  } else {
                    api.sendMessage(`ไม่สำเร็จ: ${result?.status?.message || "Unknown error"}`, event.threadID);
                  }
                } catch (e) {
                  api.sendMessage("เกิดข้อผิดพลาด puppeteer หรือ network", event.threadID);
                }
              } else {
                api.sendMessage("QR นี้ไม่มี v=hash", event.threadID);
              }
            };
            qr.decode(image.bitmap);
          } catch (e) {
            api.sendMessage("โหลดหรือถอด QR ผิดพลาด", event.threadID);
          }
        }
      }
    }
  });
});
