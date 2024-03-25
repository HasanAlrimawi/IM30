import { PaxSerialDriver } from "./pax-serial-device.js";
import { PaxUsbDriver } from "./pax-usb-driver.js";

const paxInstance = new PaxSerialDriver();
const connect = async () => {
  try {
    const device = await navigator.serial.requestPort({ filters: [] });
    paxInstance.setDeviceUnderUse(device);
    paxInstance.connectDevice();
    device.addEventListener("disconnect", (event) => {
      alert(
        `Device of VID ${device.vendorId} and PID ${device.productId} has been disconnected`
      );
    });
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
    console.log(response.traceInformation[2]); //time of transaction
    console.log(response.accountInformation[2]); //expiry date
    console.log(response.accountInformation);
    const transactionTime = parseDateTime(response.traceInformation[2]);
    responseStatusUIHolder.textContent = `Payment status: ${
      response.responseCode == "000000" ? "Success" : "failure"
    }\nCommand response message: ${
      response.responseMessage
    }\nTransaction result: ${
      response.hostInformation[1]
    }\nCard holder expiry date: ${
      response.accountInformation[2]
    }\nTransaction date: ${transactionTime.date}\nTransaction time: ${
      transactionTime.time
    }\nTransaction amount: ${parseInt(response.amountInformation[0]) / 100}$`;
  } else {
    responseStatusUIHolder.textContent = `Payment status: Failure\nFailure stage: ${response.stage}\nTransaction result: ${response.hostInformation[1]}\nError: ${response.message}`;
  }
};

function parseDateTime(dateTimeString) {
  // Extract date and time components
  const year = dateTimeString.substring(0, 4);
  const month = dateTimeString.substring(4, 6);
  const day = dateTimeString.substring(6, 8);
  const hours = dateTimeString.substring(8, 10);
  const minutes = dateTimeString.substring(10, 12);
  const seconds = dateTimeString.substring(12, 14);

  // Log the parsed date and time components
  return {
    date: `${year}/${month}/${day}`,
    time: `${hours}:${minutes}:${seconds}`,
  };
}

const initialize = async () => {
  const responseStatusUIHolder = document.getElementById("response-holder");
  responseStatusUIHolder.textContent = "Init pending...";
  const response = await paxInstance.initialize();

  if (response.success) {
    responseStatusUIHolder.textContent = `Initialization status: ${
      response.responseCode == "000000" ? "Success" : "failure"
    }\nCommand response message: ${response.responseMessage}`;
  } else {
    responseStatusUIHolder.textContent = `Initialization status: Failure\nError: ${response.message}`;
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
    }\nCommand response message: ${response.responseMessage}`;
  } else {
    responseStatusUIHolder.textContent = `Show message status: Failure\nError: ${response.message}`;
  }
};

// const getInputAccount = async () => {
//   await paxInstance.getInputAccount();
// };

const clearBatch = async () => {
  const responseStatusUIHolder = document.getElementById("response-holder");
  responseStatusUIHolder.textContent = "Clearing batch pending...";
  const response = await paxInstance.clearBatch();
  console.log(response);

  if (response.success) {
    responseStatusUIHolder.textContent = `Clear batch status: ${
      response.responseCode == "000000" ? "Success" : "failure"
    }\nCommand response message: ${response.responseMessage}`;
  } else {
    responseStatusUIHolder.textContent = `Clear batch status: Failure\nError: ${response.message}`;
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
