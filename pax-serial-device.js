import { BaseDeviceSerialDriver } from "./base-serial-device-driver.js";
import { trustCommerceAPIs } from "./trust-commerce.js";

export class PaxSerialDriver extends BaseDeviceSerialDriver {
  constructor() {
    super(9600);
    this.PAX_CONSTANTS = {
      STX: 0x02,
      ETX: 0x03,
      ACK: 0x06,
      NAK: 0x15,
      EOT: 0x04,
    };
    this.PROTOCOL_VERSION = new Uint8Array([0x031, 0x2e, 0x34, 0x33]);
    this.ECR_REFERENCE_NUMBER = 0x01;
    this.paymentGateway = trustCommerceAPIs;
  }
  PAX_CONSTANTS;
  PROTOCOL_VERSION;
  ECR_REFERENCE_NUMBER;
  paymentGateway;

  load = () => {
    const savedDevice = navigator.serial.getPorts().filter((deviceElement) => {
      return (
        deviceElement.productId == this.productId &&
        deviceElement.vendorId == this.vendorId
      );
    })[0];
    if (savedDevice) {
      this.setDeviceUnderUse(savedDevice);
    }
  };

  /**
   * Keeps on reading the serial port until there's nothing to read or
   *     end of transaction received, or some fatal error occured.
   *
   * @returns {ReadingSuccess | FunctionalityFailure}
   */
  read = async () => {
    const reader = this.device.readable.getReader();
    let completeResponse = [];
    const decoder = new TextDecoder();

    while (true) {
      try {
        const { value, done } = await reader.read();
        const valueAsArray = Array.from(value);

        if (done) {
          reader.releaseLock();
          return {
            success: "Success at reading",
            value: decoder.decode(Uint8Array.from(completeResponse)),
          };
        }

        if (value) {
          console.log("new value read within read function");
          console.log(value);
          completeResponse.push(...valueAsArray);

          if (completeResponse.includes(this.PAX_CONSTANTS.ETX)) {
            const indexBeforeETX = completeResponse.indexOf(
              this.PAX_CONSTANTS.ETX
            );
            const STXIndex = completeResponse.indexOf(this.PAX_CONSTANTS.STX);
            // (STXIndex + 3) to exclude unneeded bytes STX, status, separator
            completeResponse = completeResponse.slice(
              STXIndex + 3,
              indexBeforeETX
            );
            reader.releaseLock();
            return {
              success: "Success at reading",
              value: decoder.decode(Uint8Array.from(completeResponse)),
            };
          }
        }
      } catch (error) {
        return { error: error };
      }
    }
  };

  /**
   * Converts the number or string passed to it to its corresponding
   *     Uint8Array representation.
   *
   * @param {number | string} data The data to be converted to Uint8Array
   *     representation.
   * @returns {Uint8Array} Data entered but in its Uint8Array representation
   */
  #convertToUint8Array = (data) => {
    const encoder = new TextEncoder();
    if (typeof data === "number") {
      console.log("num");
      data = data.toString();
    }
    if (typeof data === "string") {
      console.log("str");
      data = encoder.encode(data);
    }
    return data;
  };

  /**
   * Responsible for returning the command with the LRC byte appended to the
   *     end of the command.
   *
   * @param {Uint8Array} command Represents the command to be sent for the PAX
   *     device, it's expected to contain the STX and ETX bytes
   *
   * @returns {Uint8Array} The command with the LRC byte appended to it
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
  initialize = async () => {
    let commandArray = new Uint8Array([
      this.PAX_CONSTANTS.STX,
      0x41,
      0x30,
      0x30,
      0x1c,
      ...this.PROTOCOL_VERSION,
      this.PAX_CONSTANTS.ETX,
    ]);
    commandArray = this.#lrcAppender(commandArray);
    await this.write(commandArray);
    const response = await this.read();
    console.log(response);
    if (response?.success) {
      const [
        command,
        version,
        responseCode,
        responseMessage,
        SN,
        modelName,
        OSVersion,
        MACAdress,
        numberOfLinesPerScreen,
        numberOfCharsPerLine,
        additionalInformation,
        touchScreen,
        HWConfigBitmap,
        appActivated,
        licenseExpiry,
      ] = response.value.split(String.fromCharCode(0x1c));
      console.log(
        `Initialize command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );
    } else if (response?.error) {
      console.log("try again, miscommunication occured. Error is: ");
      console.log(response.error);
      return {
        error: "error",
      };
    }
  };

  #getSignature = async () => {
    // const getSignatureCommand = `${this.PAX_CONSTANTS.STX}A08[1c]${this.PROTOCOL_VERSION}[1c]0[1c]90000${this.PAX_CONSTANTS.ETX}J`;
    const signatureImageOffset = new Uint8Array([
      0x39, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    let getSignatureCommand = new Uint8Array([
      this.PAX_CONSTANTS.STX,
      0x41,
      0x30,
      0x38,
      0x1c,
      ...this.PROTOCOL_VERSION,
      0x1c,
      0x00,
      0x1c,
      ...signatureImageOffset,
      this.PAX_CONSTANTS.ETX,
    ]);
    getSignatureCommand = this.#lrcAppender(getSignatureCommand);
    await this.write(getSignatureCommand);
    const response = await this.read();
    if (response?.success) {
      const [
        command,
        version,
        responseCode,
        responseMessage,
        totalLength,
        responseLength,
        signatureData,
      ] = response.value.split(String.fromCharCode(0x1c));
      console.log(
        `Get signature command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );
      return { success: "success" };
    } else if (response?.failure) {
      console.log("miscommunications occurred, try again.");
      return { error: "failure" };
    }
  };

  pay = async (amount) => {
    const initResult = await this.initialize();
    if (initResult?.error) {
      return { error: initResult.error };
    }
    const getSigResult = await this.#getSignature();
    if (getSigResult.failure) {
      return { error: getSigResult.failure };
    }
    // [1c] means <FS> which is the separator of request/response fields
    // [1f] means <US> which is the separator of the request amount information
    amount = this.#convertToUint8Array(amount);
    const requestAmountInformation = new Uint8Array([
      ...amount,
      0x1f,
      0x00,
      0x1f,
      0x00,
      0x1f,
    ]);
    const saleTransactionType = 0x01; // To make a normal sale transaction
    // const doCreditCommand = `${this.PAX_CONSTANTS.STX}T00[1c]${this.PROTOCOL_VERSION}[1c]${saleTransactionType}[1c]${requestAmountInformation}[1c][1c]${this.ECR_REFERENCE_NUMBER}[1c][1c][1c][1c][1c][1c]${PAX_CONSTANTS.ETX}C`;
    let doCreditCommand = new Uint8Array([
      this.PAX_CONSTANTS.STX,
      0x54,
      0x30,
      0x30,
      0x1c,
      ...this.PROTOCOL_VERSION,
      0x1c,
      saleTransactionType,
      0x1c,
      ...requestAmountInformation,
      0x1c,
      0x1c,
      this.ECR_REFERENCE_NUMBER,
      0x1c,
      0x1c,
      0x1c,
      0x1c,
      0x1c,
      0x1c,
      this.PAX_CONSTANTS.ETX,
    ]);
    doCreditCommand = this.#lrcAppender(doCreditCommand);
    await this.write(doCreditCommand);
    const response = await this.read();
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
      ] = response.value.split(String.fromCharCode(0x1c));
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
    } else if (response.error) {
      console.log("Couldn't do credit");
    }
  };

  getInputAccount = async () => {
    // const getInputCommand = `${this.PAX_CONSTANTS.STX}A30[1c]${this.PROTOCOL_VERSION}[1c]1[1c]1[1c]1[1c]1[1c][1c][200][1c][1c][1c][1c][1c]01[1c]01[1c][1c]${this.PAX_CONSTANTS.ETX}J`;
    let getInputCommand = new Uint8Array([
      this.PAX_CONSTANTS.STX,
      0x41,
      0x33,
      0x30,
      0x1c,
      ...this.PROTOCOL_VERSION,
      0x1c,
      0x31,
      0x1c,
      0x30,
      0x1c,
      0x31,
      0x1c,
      0x31,
      0x1c,
      0x1c,
      0x32,
      0x30,
      0x30,
      0x1c,
      0x1c,
      0x1c,
      0x1c,
      0x1c,
      0x30,
      0x31,
      0x1c,
      0x30,
      0x31,
      0x1c,
      0x1c,
      this.PAX_CONSTANTS.ETX,
    ]);
    getInputCommand = this.#lrcAppender(getInputCommand);
    await this.write(getInputCommand);
    const response = await this.read();

    if (response?.success) {
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
      ] = response.value.split(String.fromCharCode(0x1c));
      console.log(
        `Get input account command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );

      return {
        success: "success",
        exp: expiryDate,
        cc: PAN,
      };
    } else if (response?.error) {
      console.log("Couldn't get input account");
    }
  };

  /**
   * Shows a message on the PAX device display.
   *
   * @param {{title: string, body: string}} message Represents the message
   *     to be shown on the PAX device
   */
  showMessage = async (message) => {
    const messageBody = this.#convertToUint8Array(message.body);
    const messageTitle = this.#convertToUint8Array(message.title);
    // const showMessageCommand = `${this.PAX_CONSTANTS.STX}A10[1c]${this.PROTOCOL_VERSION}[1c]${message.body}[1c]${message.title}[1c][1c][1c][1c]5[1c][1c][1c][1c]${this.PAX_CONSTANTS.ETX}K`;
    let showMessageCommand = new Uint8Array([
      this.PAX_CONSTANTS.STX,
      0x41,
      0x31,
      0x30,
      0x1c,
      ...this.PROTOCOL_VERSION,
      0x1c,
      ...messageBody,
      0x1c,
      ...messageTitle,
      0x1c,
      0x1c,
      0x1c,
      0x1c,
      0x35,
      0x1c,
      0x1c,
      0x1c,
      0x1c,
      this.PAX_CONSTANTS.ETX,
    ]);
    showMessageCommand = this.#lrcAppender(showMessageCommand);
    await this.write(showMessageCommand);
    const response = await this.read();
    console.log(`response: ${response}`);
    if (response?.success) {
      const [command, version, responseCode, responseMessage] =
        response.value.split(String.fromCharCode(0x1c));
      console.log(
        `Show message command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );
    } else if (response?.error) {
      console.log("Couldn't show message");
    }
  };

  // TODO address it
  clearMessage = async () => {
    const clearMessageCommand = `${this.PAX_CONSTANTS.STX}A12[1c]${this.PROTOCOL_VERSION}${this.PAX_CONSTANTS.ETX}K`;
    await this.write(clearMessageCommand);
    const response = await this.read();
    if (response?.success) {
      const [command, version, responseCode, responseMessage] =
        response.value.split("[1c]");
      console.log(
        `Clear message command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );
    } else if (response?.failure) {
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
