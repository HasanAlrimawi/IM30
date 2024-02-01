import { terminalsSupported } from "./devices-list.js";

navigator.usb.getDevices().then((devices) => {
  console.log(`Total devices: ${devices.length}`);
  devices.forEach((device) => {
    console.log(
      `Product name: ${device.productName}, serial number ${device.serialNumber}`
    );
  });
});

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("connect").addEventListener("click", connectDevice);
  document.getElementById("send").addEventListener("click", sendData);
});
document.getElementById("pay-form").addEventListener("submit", () => {
  const amount = document.getElementById("amount").value;
  paxIM30.pay(amount);
});

let selectedDeviceDetails = {
  deviceName: undefined,
  vendorId: undefined,
  productId: undefined,
  configuration: undefined,
  interface: undefined,
  endpoint: undefined,
};

let device = undefined;

const DEVICE_LOCAL_STORAGE_KEY = "terminal under use";

const connectDevice = async () => {
  const filters = terminalsSupported.map((terminal) => {
    return { vendorId: terminal.vendorId, productId: terminal.productId };
  });

  try {
    device = await navigator.usb.requestDevice({ filters: [] });
    selectedDeviceDetails = terminalsSupported.filter((deviceElement) => {
      return (
        deviceElement.productId === device.productId &&
        deviceElement.vendorId === device.vendorId
      );
    })[0];
    console.log(device);
    await device.open();
    await device.selectConfiguration(selectedDeviceDetails.configuration);
    await device.claimInterface(selectedDeviceDetails.interface);
  } catch (error) {
    console.log(`Device couldn't be opened \n${error}`);
  }
};

const saveDevice = (device) => {
  localStorage.setItem(
    DEVICE_LOCAL_STORAGE_KEY,
    JSON.stringify(selectedDeviceDetails)
  );
};

const loadDevice = () => {
  selectedDeviceDetails = JSON.parse(
    localStorage.getItem(DEVICE_LOCAL_STORAGE_KEY)
  );
};

const connectSavedDevice = async () => {
  loadDevice();
  if (selectedDeviceDetails) {
    try {
      const devicesWithPermissions = navigator.usb.getDevices();
      const device = devicesWithPermissions.filter((deviceElement) => {
        return (
          deviceElement.productId === selectedDeviceDetails.productId &&
          deviceElement.vendorId === selectedDeviceDetails.vendorId
        );
      });
      await device.open();
      await device.selectConfiguration(selectedDeviceDetails.configuration);
      await device.claimInterface(selectedDeviceDetails.interface);
    } catch (error) {
      console.log(`Device couldn't be opened \n${error}`);
    }
  }
};

async function listen() {
  let result = await device.transferIn(selectedDeviceDetails.endpoint, 64);
  const decoder = new TextDecoder();
  let message = decoder.decode(result.data);
  console.log(message);
  return message;
}

async function sendData(data) {
  const encoder = new TextEncoder();
  await device.transferOut(
    selectedDeviceDetails.endpoint,
    encoder.encode(data)
  );
}

const paxIM30 = (function () {
  const PAX_CONSTANTS = {
    STX: "[02]",
    ETX: "[03]",
    ACK: "[06]",
    NAK: "[15]",
    EOT: "[04]",
  };
  const PROTOCOL_VERSION = "1.26";
  const ECR_REFERENCE_NUMBER = "1";

  const getPaxResponse = async () => {
    let result = await listen();
    let responseCompleteData = "";
    /**
     * Takes the response as is from device, then returns the important
     *     data within it after removing the prefix and suffic included in
     *     every pax response.
     *
     * @param {string} response Represents the response from PAX device
     * @returns {string} Represents the important response data without the
     *     starting and ending representations of the response
     */
    const extractResponseData = (response) => {
      let resultPrefixRemoved = "";

      response.includes(`${PAX_CONSTANTS.STX}1[1c]`)
        ? (resultPrefixRemoved = response.split(`${PAX_CONSTANTS.STX}1[1c]`)[1])
        : (resultPrefixRemoved = response.split(
            `${PAX_CONSTANTS.STX}0[1c]`
          )[1]);
      const resultSuffixPrefixRemoved = resultPrefixRemoved.split(
        `${PAX_CONSTANTS.ETX}`
      )[0];
      return resultSuffixPrefixRemoved;
    };

    if (result == PAX_CONSTANTS.ACK) {
      result = await listen();

      while (result.startsWith(`${PAX_CONSTANTS.STX}1`)) {
        responseCompleteData = responseCompleteData.concat(
          extractResponseData(result)
        );
        sendData(PAX_CONSTANTS.ACK);
        result = await listen();
      }
      responseCompleteData = responseCompleteData.concat(
        extractResponseData(result)
      );
      sendData(PAX_CONSTANTS.ACK);
      return { success: "success", responseData: message };
    } else if (result == PAX_CONSTANTS.NAK) {
      return { failure: "failure", error: "request not acknowledged" };
    } else if (result == PAX_CONSTANTS.EOT) {
      return { compeleted: "completed", responseData: "end of transmission" };
    }
  };

  /**
   * Used to direct the PAX terminal into making internal test/check and
   *     initialize the terminal for transactions.
   */
  const intilialize = async () => {
    const intializeCommand = `${PAX_CONSTANTS.STX}A00[1c]${PROTOCOL_VERSION}${PAX_CONSTANTS.ETX}K`;
    await sendData(intializeCommand);
    const response = await getPaxResponse();
    if (response.success) {
      const [
        command,
        version,
        responseCode,
        responseMessage,
        SN,
        modelNumber,
        OSVersion,
        MACAdress,
        numberOfLines,
        numberOfCharsPerLine,
        additionalInformation,
        touchScreen,
        HWConfigBitmap,
        appActivated,
        licenseExpiry,
      ] = response.split("[1c]");
    } else if (response.failure) {
      console.log("try again, miscommunication occured");
    }
  };

  const getSignature = async () => {
    const getSignatureCommand = `${PAX_CONSTANTS.STX}A08[1c]${PROTOCOL_VERSION}[1c]0[1c]90000${PAX_CONSTANTS.ETX}J`;
    await sendData(getSignatureCommand);
    const response = await getPaxResponse();
    if (response.success) {
      const [
        command,
        version,
        responseCode,
        responseMessage,
        totalLength,
        responseLength,
        signatureData,
      ] = response.split("[1c]");
      return { success: "success" };
    } else if (response.failure) {
      console.log("miscommunications occurred, try again.");
      return { failure: "failure" };
    }
  };

  const pay = async (amount) => {
    const initResult = await intilialize();
    if (initResult.failure) {
      return { error: initResult.failure };
    }
    const getSigResult = await getSignature();
    if (getSigResult.failure) {
      return { error: getSigResult.failure };
    }
    // [1c] means <FS> which is the separator of request/response fields
    // [1f] means <US> which is the separator of the request amount information
    const requestAmountInformation = `${amount}[1f]0[1f]0[1f]`;
    const saleTransactionType = "01"; // To make a normal sale transaction
    const doCreditCommand = `${PAX_CONSTANTS.STX}T00[1c]${PROTOCOL_VERSION}[1c]${saleTransactionType}[1c]${requestAmountInformation}[1c][1c]${ECR_REFERENCE_NUMBER}[1c][1c][1c][1c][1c][1c]${PAX_CONSTANTS.ETX}C`;
    await sendData(doCreditCommand);
    const response = await getPaxResponse();
    const [
      command,
      version,
      responseCode,
      responseMessage,
      hostInformation,
      transactionType,
      amountInformation,
      accountInformation,
      traceInformation,
      AVSInformation,
      commercialInfomration,
      eCommerce,
      additionalInformation,
    ] = response.split("[1c]");
    console.log(`payment result is: ${responseCode}`);
  };

  return {
    pay,
  };
})();
