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
    const finalCommandArray = new Uint8Array([...command, lrc]);
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
      return {
        success: "successful communication with terminal",
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
      };
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
    // const initResult = await this.initialize();
    // if (initResult?.error || initResult?.responseCode != "000000") {
    //   return { error: "Initialization failed" };
    // }
    // console.log(initResult);


    // const getSigResult = await this.#getSignature();
    // if (getSigResult.failure) {
    //   return { error: getSigResult.failure };
    // }
    // [1c] means <FS> which is the separator of request/response fields
    // [1f] means <US> which is the separator of the request amount information
    amount = this.#convertToUint8Array(amount);
    // const requestAmountInformation = new Uint8Array([
    //   ...amount,
    //   0x1f,
    //   0x00,
    //   0x1f,
    //   0x00,
    // ]);
    // const saleTransactionType = 0x01; // To make a normal sale transaction
    // const doCreditCommand = `${this.PAX_CONSTANTS.STX}T00[1c]${this.PROTOCOL_VERSION}[1c]${saleTransactionType}[1c]${requestAmountInformation}[1c][1c]${this.ECR_REFERENCE_NUMBER}[1c][1c][1c][1c][1c][1c]${PAX_CONSTANTS.ETX}C`;
    let doCreditFields = {
      saleTransactionType: 0x03, // auth transaction
      requestAmountInformation: [0x00],
      requestTraceInformation: [this.ECR_REFERENCE_NUMBER],
    };
    console.log("doCreditFields:");
    console.log(doCreditFields);
    let response = await this.doCredit(doCreditFields);

    if (response?.error) {
      console.log("error occured");
      return { error: "Auth error" };
    } else if (response?.failure) {
      console.log("Auth failed: " + response.responseMessage);
      return {
        failure: response.responseMessage,
      };
    }
    console.log(
      `orgRefNum as it should be from trace information: ${
        response.traceInformation.split(String.fromCharCode(0x1f))[0]
      }`
    );
    doCreditFields.saleTransactionType = 0x04;
    doCreditFields.requestTraceInformation = [
      this.ECR_REFERENCE_NUMBER,
      0x1f,
      0x1f,
      0x1f,
      response.traceInformation.split(String.fromCharCode(0x1f))[0],
    ];
    doCreditFields.requestAmountInformation = Array.from(amount);
    console.log("doCreditFields:");
    console.log(doCreditFields);
    response = await this.doCredit(doCreditFields);
    console.log(response);

    if (response?.error) {
      console.log("error occured");
      return { error: "PostAuth error" };
    } else if (response?.failure) {
      console.log("PostAuth failed");
      return {
        failure: response.responseMessage,
      };
    }
    return {
      success: response.responseMessage,
    };
  };

  doCredit = async (doCreditRequestOptions) => {
    const doCreditCommand = [0x54, 0x30, 0x30]; // T00
    const doCreditRequestArray = [
      this.PAX_CONSTANTS.STX,
      ...doCreditCommand,
      0x1c,
      ...this.PROTOCOL_VERSION,
      0x1c,
      doCreditRequestOptions.saleTransactionType
        ? doCreditRequestOptions.saleTransactionType
        : "na",
      0x1c,
      ...(doCreditRequestOptions.requestAmountInformation
        ? doCreditRequestOptions.requestAmountInformation
        : ["na"]),
      0x1c,
      ...(doCreditRequestOptions.requestAccountInformation
        ? doCreditRequestOptions.requestAccountInformation
        : ["na"]),
      0x1c,
      ...(doCreditRequestOptions.requestTraceInformation
        ? doCreditRequestOptions.requestTraceInformation
        : ["na"]),
      0x1c,
      ...(doCreditRequestOptions.requestAVSInformation
        ? doCreditRequestOptions.requestAVSInformation
        : ["na"]),
      0x1c,
      ...(doCreditRequestOptions.requestCashierInformation
        ? doCreditRequestOptions.requestCashierInformation
        : ["na"]),
      0x1c,
      ...(doCreditRequestOptions.requestCommercialInformation
        ? doCreditRequestOptions.requestCommercialInformation
        : ["na"]),
      0x1c,
      ...(doCreditRequestOptions.requestMOTOInformation
        ? doCreditRequestOptions.requestMOTOInformation
        : ["na"]),
      0x1c,
      ...(doCreditRequestOptions.requestAdditionalInformation
        ? doCreditRequestOptions.requestAdditionalInformation
        : ["na"]),
      0x1c,
      this.PAX_CONSTANTS.ETX,
    ];
    console.log(
      "Do credit command in its final shape before LRC and Uint8Array conversion:"
    );
    // console.log(doCreditRequestArray);
    let doCreditRequest = Uint8Array.from(
      doCreditRequestArray.filter((element) => element !== "na")
    );
    console.log(doCreditRequest);
    doCreditRequest = this.#lrcAppender(doCreditRequest);
    console.log(doCreditRequest);
    await this.write(doCreditRequest);
    console.log("before starting reading");
    const response = await this.read();
    console.log("finished reading");

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
        VASInfromation,
        TORInformation,
        payloadData,
        hostCredentialInformation,
      ] = response.value.split(String.fromCharCode(0x1c));
      console.log(
        `payment result response code is: ${responseCode} of zeros equality equality condition:`
      );
      console.log(responseCode === "000000");
      console.log(
        `Do credit command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );
      console.log(response.value.split(String.fromCharCode(0x1c)));
      if (responseCode == "000000") {
        return {
          success: "success",
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
          VASInfromation,
          TORInformation,
          payloadData,
          hostCredentialInformation,
        };
      } else {
        console.log("Do credit Failure");
        return {
          failure: "",
          responseCode,
          responseMessage,
        };
      }
    } else if (response?.error) {
      console.log("Couldn't do credit, error");
      return { error: response.error };
    }
    console.log(response);
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
