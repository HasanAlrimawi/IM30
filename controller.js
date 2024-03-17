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

const initialize = async () => {
  await paxInstance.initialize();
};

const showMessage = async () => {
  const message = {
    title: "Greetings",
    body: "Hello Omar",
  };
  await paxInstance.showMessage(message);
};

const getInputAccount = async () => {
  await paxInstance.getInputAccount();
};

const clearBatch = async () => {
  await paxInstance.clearBatch();
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("connect").addEventListener("click", connect);
  document.getElementById("pay-form").addEventListener("submit", pay);
  document
    .getElementById("initialize-button")
    .addEventListener("click", initialize);
  document
    .getElementById("show-message-button")
    .addEventListener("click", showMessage);
  document
    .getElementById("get-input-account-button")
    .addEventListener("click", getInputAccount);

  document.getElementById("clear-batch").addEventListener("click", clearBatch);
});
