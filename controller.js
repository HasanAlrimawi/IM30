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
  const responseStatusUIHolder = document.getElementById("response-holder");
  responseStatusUIHolder.textContent = "payment pending...";
  const amount = document.getElementById("amount").value;
  console.log(`User entered amount of: ${amount}`);
  const response = await paxInstance.pay(amount);
  console.log(response);

  if (response.success) {
    console.log(response.traceInformation);
    console.log(response.accountInformation);
    responseStatusUIHolder.textContent = `Payment status: ${
      response.responseCode == "000000" ? "Success" : "failure"
    }
  Command response message: ${response.responseMessage}
  Card holder name: ${response.accountInformation[7]}`;
  } else {
    responseStatusUIHolder.textContent = `Payment status: Failure
    Failure stage: ${response.stage}
    Error: ${response.error}`;
  }
};

const initialize = async () => {
  const responseStatusUIHolder = document.getElementById("response-holder");
  responseStatusUIHolder.textContent = "Init pending...";
  const response = await paxInstance.initialize();

  if (response.success) {
    responseStatusUIHolder.textContent = `Initialization status: ${
      response.responseCode == "000000" ? "Success" : "failure"
    }
    Command response message: ${response.responseMessage}`;
  } else {
    responseStatusUIHolder.textContent = `Initialization status: Failure
    Error: ${response.error}`;
  }
};

const showMessage = async () => {
  const message = {
    title: "Greetings",
    body: "Hello Omar",
  };
  const responseStatusUIHolder = document.getElementById("response-holder");
  responseStatusUIHolder.textContent = "Showing message pending...";
  const response = await paxInstance.showMessage(message);

  if (response.success) {
    responseStatusUIHolder.textContent = `Show message status: ${
      response.responseCode == "000000" ? "Success" : "failure"
    }
    Command response message: ${response.responseMessage}`;
  } else {
    responseStatusUIHolder.textContent = `Show message status: Failure
    Error: ${response.error}`;
  }
};

// const getInputAccount = async () => {
//   await paxInstance.getInputAccount();
// };

const clearBatch = async () => {
  const responseStatusUIHolder = document.getElementById("response-holder");
  responseStatusUIHolder.textContent = "Clearing batch pending...";
  const response = await paxInstance.clearBatch();

  if (response.success) {
    responseStatusUIHolder.textContent = `Clear batch status: ${
      response.responseCode == "000000" ? "Success" : "failure"
    }
    Command response message: ${response.responseMessage}`;
  } else {
    responseStatusUIHolder.textContent = `Clear batch status: Failure
    Error: ${response.error}`;
  }
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
  // document
  //   .getElementById("get-input-account-button")
  //   .addEventListener("click", getInputAccount);

  document.getElementById("clear-batch").addEventListener("click", clearBatch);
});
