import { PaxUsbDriver } from "./pax-usb-driver.js";

const paxInstance = new PaxUsbDriver();
const connect = async () => {
  try {
    const decoder = new TextDecoder();

    const device = await navigator.serial.requestPort({ filters: [] });
    await device.open({ baudRate: 9600 });
    let read = async () => {
      let reader = await device.readable.getReader();
      while (device.readable) {
        try {
          // reader will return done if reader.cancel() used and it will break the loop
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              let message = decoder.decode(value);

              console.log(message);
              break;
            }
            // call process and give data and the current time
            let message = decoder.decode(value);
            console.log("before", value)
            console.log(message);
          }
        } catch (error) {
          console.error(error);
          break;
        } finally {
          await reader.releaseLock();
        }
      }
    };
    // const commandArray = new Uint8Array([
    //   0x02, 0x41, 0x30, 0x30, 0x1c, 0x31, 0x2e, 0x32, 0x36, 0x03, 0x46,
    // ]);
    // const intializeCommand = commandArray.buffer;
    // const message = new Uint8Array([
    //   0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x49, 0x20, 0x61, 0x6d, 0x20, 0x61,
    //   0x20, 0x6d, 0x65, 0x73, 0x73, 0x61, 0x67, 0x65,
    // ]);
    // const title = new Uint8Array([0x6d, 0x65, 0x73, 0x73, 0x61, 0x67, 0x65]);
    // // const showMessageCommand = `${this.PAX_CONSTANTS.STX}A10[1c]${this.PROTOCOL_VERSION}[1c]${message.body}[1c]${message.title}[1c][1c][1c][1c]5[1c][1c][1c][1c]${this.PAX_CONSTANTS.ETX}K`;
    // const showMessageCommand = new Uint8Array([
    //   0x02,
    //   0x41,
    //   0x31,
    //   0x30,
    //   0x1c,
    //   0x31,
    //   0x2e,
    //   0x32,
    //   0x36,
    //   0x1c,
    //   ...message,
    //   0x1c,
    //   ...title,
    //   0x1c,
    //   0x1c,
    //   0x1c,
    //   0x1c,
    //   0x35,
    //   0x1c,
    //   0x1c,
    //   0x1c,
    //   0x1c,
    //   0x03,
    //   0x34,
    // ]);
    const getInputCommand = new Uint8Array([
      0x02, 0x41, 0x33, 0x30, 0x1c, 0x31, 0x2e, 0x35, 0x38, 0x1c, 0x31, 0x1c,
      0x30, 0x1c, 0x31, 0x1c, 0x31, 0x1c, 0x1c, 0x32, 0x30, 0x30, 0x1c, 0x1c,
      0x1c, 0x1c, 0x1c, 0x30, 0x32, 0x1c, 0x30, 0x31, 0x1c, 0x1c, 0x03, 0x77,
    ]);
    const writer = device.writable.getWriter();

    await writer.write(getInputCommand);

    // Allow the serial port to be closed later.
    writer.releaseLock();

    let reading = read();

    // paxInstance.setDeviceUnderUse(device);
    // paxInstance.connectDevice();
  } catch (error) {
    console.log(error);
  }
};

const pay = async (event) => {
  event.preventDefault();
  const amount = document.getElementById("amount").value;
  console.log(`User entered amount of: ${amount}`);
  const paxPaymentResult = await paxInstance.pay(amount);
  console.log(paxPaymentResult);
};

const listen = async () => {
  await paxInstance.getPaxResponse();
};

const acknowledge = async () => {
  await paxInstance.sendAcknowledge();
};

const showMessage = async () => {
  await paxInstance.showMessage();
};

const getInputAccount = async () => {
  await paxInstance.getInputAccount();
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("connect").addEventListener("click", connect);
  document.getElementById("pay-form").addEventListener("submit", pay);
  document.getElementById("listen-button").addEventListener("click", listen);
  document
    .getElementById("acknowledge-button")
    .addEventListener("click", acknowledge);
  document
    .getElementById("show-message-button")
    .addEventListener("click", showMessage);
  document
    .getElementById("get-input-account-button")
    .addEventListener("click", getInputAccount);
});
