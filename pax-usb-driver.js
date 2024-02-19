import { BaseDeviceUsbDriver } from "./base-usb-device-driver.js";
import { trustCommerceAPIs } from "./trust-commerce.js";

export class PaxUsbDriver extends BaseDeviceUsbDriver {
  constructor() {
    super(0x1a86, 0x7523, 0, 0, 0x02, 0x02);
    this.PAX_CONSTANTS = {
      STX: 0x02,
      ETX: 0x03,
      ACK: 0x06,
      NAK: 0x15,
      EOT: 0x04,
    };
    this.PROTOCOL_VERSION = new Uint8Array([0x31, 0x2e, 0x34, 0x33]);
    this.ECR_REFERENCE_NUMBER = 0x01;
    this.paymentGateway = trustCommerceAPIs;
  }
  PAX_CONSTANTS;
  PROTOCOL_VERSION;
  ECR_REFERENCE_NUMBER;
  paymentGateway;

  load = () => {
    const savedDevice = navigator.usb.getDevices().filter((deviceElement) => {
      return (
        deviceElement.productId == this.productId &&
        deviceElement.vendorId == this.vendorId
      );
    })[0];
    if (savedDevice) {
      this.setDeviceUnderUse(savedDevice);
    }
  };

  #getPaxResponse = async () => {
    let result = await this.listen();
    console.log(`Received before extraction: ${result}`);
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

      response.includes(`${this.PAX_CONSTANTS.STX}1[1c]`)
        ? (resultPrefixRemoved = response.split(
            `${this.PAX_CONSTANTS.STX}1[1c]`
          )[1])
        : (resultPrefixRemoved = response.split(
            `${this.PAX_CONSTANTS.STX}0[1c]`
          )[1]);
      const resultSuffixPrefixRemoved = resultPrefixRemoved.split(
        `${this.PAX_CONSTANTS.ETX}`
      )[0];
      return resultSuffixPrefixRemoved;
    };

    if (result == this.PAX_CONSTANTS.ACK) {
      result = await this.listen();

      while (result.startsWith(`${this.PAX_CONSTANTS.STX}1`)) {
        responseCompleteData = responseCompleteData.concat(
          extractResponseData(result)
        );
        await this.sendData(this.PAX_CONSTANTS.ACK);
        result = await this.listen();
      }
      responseCompleteData = responseCompleteData.concat(
        extractResponseData(result)
      );
      this.sendData(this.PAX_CONSTANTS.ACK);
      return { success: "success", responseData: message };
    } else if (result == this.PAX_CONSTANTS.NAK) {
      return { failure: "failure", error: "request not acknowledged" };
    } else if (result == this.PAX_CONSTANTS.EOT) {
      return { compeleted: "completed", responseData: "end of transmission" };
    }
  };

  /**
   * Responsible for returning the command with the LRC byte appended to the
   *     end of the command.
   *
   * @param {Uint8Array} command Represents the command to be sent for the PAX
   *     device, it's expected to contatain the STX and ETX bytes.
   */
  #lrcAppender = (command) => {
    const lrc = command
      .subarray(1)
      .reduce((acc, currentValue) => (acc ^= currentValue), 0);
    const finalCommandArray = [...command, lrc];
    return finalCommandArray;
  };

  /**
   * Used to direct the PAX terminal into making internal test/check and
   *     initialize the terminal for transactions.
   */
  #intilialize = async () => {
    // const intializeCommand = `${this.PAX_CONSTANTS.STX}A00[1c]${this.PROTOCOL_VERSION}${this.PAX_CONSTANTS.ETX}K`;
    const initCommand = new Uint8Array([0x41, 0x30, 0x30]);
    let requestArray = new Uint8Array([
      this.PAX_CONSTANTS.STX,
      ...initCommand,
      0x1c,
      ...this.PROTOCOL_VERSION,
      this.PAX_CONSTANTS.ETX,
    ]);
    requestArray = this.#lrcAppender(requestArray);
    console.log(
      `Command after appending the lrc byte to it: ${requestArray.toString(16)}`
    );
    const intializeRequest = requestArray.buffer;
    console.log(intializeRequest);
    await this.sendData(intializeRequest);
    const response = await this.#getPaxResponse();

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
      ] = response.responseData.split("[1c]");
      console.log(
        `Initialize command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );
    } else if (response.failure) {
      console.log("try again, miscommunication occured");
    }
  };

  #getSignature = async () => {
    // const getSignatureCommand = `${this.PAX_CONSTANTS.STX}A08[1c]${this.PROTOCOL_VERSION}[1c]0[1c]90000${this.PAX_CONSTANTS.ETX}J`;
    const signatureCommand = new Uint8Array([0x41, 0x30, 0x38]);
    let requestArray = new Uint8Array([
      this.PAX_CONSTANTS.STX,
      ...signatureCommand,
      0x1c,
      ...this.PROTOCOL_VERSION,
      0x1c,
      0x0,
      0x1c,
      0x15f90,
      this.PAX_CONSTANTS.ETX,
    ]);
    requestArray = this.#lrcAppender(requestArray);
    const getSignatureRequest = requestArray.buffer;
    await this.sendData(getSignatureRequest);
    const response = await this.#getPaxResponse();
    if (response.success) {
      const [
        command,
        version,
        responseCode,
        responseMessage,
        totalLength,
        responseLength,
        signatureData,
      ] = response.responseData.split("[1c]");
      console.log(
        `Get signature command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );
      return { success: "success" };
    } else if (response.failure) {
      console.log("miscommunications occurred, try again.");
      return { failure: "failure" };
    }
  };

  pay = async (amount) => {
    const initResult = await this.#intilialize();

    if (initResult.failure) {
      return { error: initResult.failure };
    }
    const getSigResult = await this.#getSignature();

    if (getSigResult.failure) {
      return { error: getSigResult.failure };
    }
    // [1c] means <FS> which is the separator of request/response fields
    // [1f] means <US> which is the separator of the request amount information
    const requestAmountInformation = `${amount}[1f]0[1f]0[1f]`;
    const saleTransactionType = "01"; // To make a normal sale transaction
    const doCreditCommand = `${this.PAX_CONSTANTS.STX}T00[1c]${this.PROTOCOL_VERSION}[1c]${saleTransactionType}[1c]${requestAmountInformation}[1c][1c]${this.ECR_REFERENCE_NUMBER}[1c][1c][1c][1c][1c][1c]${PAX_CONSTANTS.ETX}C`;
    await this.sendData(doCreditCommand);
    const response = await this.#getPaxResponse();
    if (response.success) {
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
      ] = response.responseData.split("[1c]");
      console.log(`payment result is: ${responseCode}`);
      console.log(
        `Do credit command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );
      return {
        responseCode,
        responseMessage,
        accountInformation,
        amountInformation,
        transactionType,
        hostInformation,
        traceInformation,
        AVSInformation,
        commercialInfomration,
        eCommerce,
        additionalInformation,
      };
    } else if (response.failure) {
      console.log("Couldn't do credit");
    }
  };

  getInputAccount = async () => {
    // const getInputCommand = `${this.PAX_CONSTANTS.STX}A30[1c]${this.PROTOCOL_VERSION}[1c]1[1c]1[1c]1[1c]1[1c][1c][200][1c][1c][1c][1c][1c]01[1c]01[1c][1c]${this.PAX_CONSTANTS.ETX}J`;
    const getInputCommand = new Uint8Array([0x41, 0x33, 0x30]);
    let requestArray = new Uint8Array([
      this.PAX_CONSTANTS.STX,
      ...getInputCommand,
      0x1c,
      ...this.PROTOCOL_VERSION,
      0x1c,
      0x1,
      0x1c,
      0x1,
      0x1c,
      0x1,
      0x1c,
      0x1,
      0x1c,
      0x1c,
      0xc8,
      0x1c,
      0x1c,
      0x1c,
      0x1c,
      0x1c,
      0x01,
      0x1c,
      0x01,
      0x1c,
      0x1c,
      this.PAX_CONSTANTS.ETX,
    ]);
    requestArray = this.#lrcAppender(requestArray);
    getInputRequest = requestArray.buffer;
    await this.sendData(getInputRequest);
    const response = await this.#getPaxResponse();

    if (response.success) {
      const [
        command,
        version,
        responseCode,
        responseMessage,
        entryMode,
        trackOneData,
        trackTwoData,
        trackThreeData,
        PAN,
        expiryDate,
        QRCode,
        KSN,
        additionalInformation,
      ] = response.responseData.split("[1c]");
      console.log(
        `Get input account command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );

      return {
        success: "success",
        exp: expiryDate,
        cc: PAN,
      };
    } else if (response.failure) {
      console.log("Couldn't get input account");
    }
  };

  showMessage = async (message) => {
    const showMessageCommand = `${this.PAX_CONSTANTS.STX}A10[1c]${this.PROTOCOL_VERSION}[1c]${message.body}[1c]${message.title}[1c][1c][1c][1c]5[1c][1c][1c][1c]${this.PAX_CONSTANTS.ETX}K`;
    console.log(`command sent: ${showMessageCommand}`);
    await this.sendData(showMessageCommand);
    const response = await this.#getPaxResponse();
    console.log(`response: ${response}`);
    if (response.success) {
      const [command, version, responseCode, responseMessage] =
        response.responseData.split("[1c]");
      console.log(
        `Show message command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );
    } else if (response.failure) {
      console.log("Couldn't show message");
    }
  };

  clearMessage = async () => {
    const clearMessageCommand = `${this.PAX_CONSTANTS.STX}A12[1c]${this.PROTOCOL_VERSION}${this.PAX_CONSTANTS.ETX}K`;
    await this.sendData(clearMessageCommand);
    const response = await this.#getPaxResponse();
    if (response.success) {
      const [command, version, responseCode, responseMessage] =
        response.responseData.split("[1c]");
      console.log(
        `Clear message command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );
    } else if (response.failure) {
      console.log("Couldn't clear message");
    }
  };

  payByGateway = async (amount) => {
    const accountDetailsRequest = await this.getInputAccount();
    if (accountDetailsRequest.success) {
      return await this.paymentGateway.payByTrustCommerce(
        amount,
        accountDetailsRequest.cc,
        accountDetailsRequest.exp
      );
    }
  };
}
