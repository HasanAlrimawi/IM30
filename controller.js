import { PaxSerialDriver } from "./pax-serial-device.js";
import { PaxUsbDriver } from "./pax-usb-driver.js";

const paxInstance = new PaxSerialDriver();
const connect = async () => {
  try {
    const device = await navigator.serial.requestPort({ filters: [] });
    paxInstance.setDeviceUnderUse(device);
    paxInstance.connectDevice();
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

// const acknowledge = async () => {
//   await paxInstance.sendAcknowledge();
// };

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
  // document
  //   .getElementById("acknowledge-button")
  //   .addEventListener("click", acknowledge);
  document
    .getElementById("show-message-button")
    .addEventListener("click", showMessage);
  document
    .getElementById("get-input-account-button")
    .addEventListener("click", getInputAccount);
});
