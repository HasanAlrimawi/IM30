import { PaxUsbDriver } from "./pax-usb-driver.js";

const paxInstance = new PaxUsbDriver();
const connect = async () => {
  try {
    const device = await navigator.usb.requestDevice({ filters: [] });
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
  const paxPaymentResult = await paxInstance.pay({
    title: "Payment amount",
    body: amount,
  });
  console.log(paxPaymentResult);
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("connect").addEventListener("click", connect);
  document.getElementById("pay-form").addEventListener("submit", pay);
});
