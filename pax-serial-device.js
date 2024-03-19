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

  //the below one also checks for EOT but send ACK as soon as complete response STX-ETX has been discovered.
  read = async () => {
    const reader = this.device.readable.getReader();
    let completeResponse = [];
    const decoder = new TextDecoder();
    const allResponses = [];

    while (true) {
      try {
        const { value, done } = await reader.read();
        const valueAsArray = Array.from(value);

        if (done) {
          console.log(this.device);
          console.log(reader);
          await reader.cancel();
          await reader.releaseLock();
          console.error(
            "returning from done condition finish of read function"
          );
          return {
            success: "Success at reading",
            value: decoder.decode(Uint8Array.from(completeResponse)),
          };
        }

        if (value) {
          console.log("\nnew value read within read function  --->");
          console.log(decoder.decode(Uint8Array.from(valueAsArray)));
          console.log("\n");
          const EOTIndex = valueAsArray.findIndex((item) => item == 4);
          console.log(
            `valueAsArray.includes(EOT) = ${valueAsArray.findIndex(
              (item) => item == 4
            )}`
          );
          console.log(
            `valueAsArray.includes(ACK) = ${valueAsArray.findIndex(
              (item) => item == 6
            )}`
          );
          console.log(
            `valueAsArray.includes(NAK) = ${valueAsArray.findIndex(
              (item) => item == 21
            )}`
          );

          if (EOTIndex >= 0) {
            await reader.releaseLock();
            console.log(Uint8Array.from(completeResponse).toString());
            console.log(decoder.decode(Uint8Array.from(completeResponse)));
            return {
              success: "Success at reading",
              value: decoder.decode(Uint8Array.from(completeResponse)),
            };
          }

          completeResponse.push(...valueAsArray);
          // FOREVER, this will add all responses stx-etx to allResponses array
          if (completeResponse.includes(this.PAX_CONSTANTS.ETX)) {
            const indexBeforeETX = completeResponse.lastIndexOf(
              this.PAX_CONSTANTS.ETX
            );
            const STXIndex = completeResponse.lastIndexOf(
              this.PAX_CONSTANTS.STX
            );
            // console.warn(decoder.decode(Uint8Array.from(completeResponse)));
            console.log(
              "Complete response length BEFORE extraction using STX-ETX"
            );
            console.log(completeResponse.length);
            console.log();
            // (STXIndex + 3) to exclude unneeded bytes STX, status, separator
            completeResponse = completeResponse.slice(
              STXIndex + 3,
              indexBeforeETX
            );
            console.log(
              "Complete response length AFTER extraction using STX-ETX"
            );
            console.log(completeResponse.length);
            allResponses.push(
              decoder.decode(Uint8Array.from(completeResponse))
            );
            console.log("\nAll responses:");
            console.log(allResponses);
            console.log();
            await this.write(new Uint8Array([this.PAX_CONSTANTS.ACK]));
            // await reader.cancel();
          }
        }
      } catch (error) {
        console.error("non fatal error occured");
        return { error: error };
      }
    }
  };

  // the below one is with checking EOT for every value that has been read
  /**
   * Keeps on reading the serial port until there's nothing to read or
   *     end of transaction received, or some fatal error occured.
   *
   * @returns {ReadingSuccess | FunctionalityFailure}
   */
  // read = async () => {
  //   const reader = this.device.readable.getReader();
  //   let completeResponse = [];
  //   const decoder = new TextDecoder();
  //   const allResponses = [];
  //   const allCapturedValues = [];

  //   while (true) {
  //     try {
  //       const { value, done } = await reader.read();
  //       const valueAsArray = Array.from(value);

  //       if (done) {
  //         console.log(this.device);
  //         console.log(reader);
  //         await reader.cancel();
  //         await reader.releaseLock();
  //         console.error(
  //           "returning from done condition finish of read function"
  //         );
  //         return {
  //           success: "Success at reading",
  //           value: decoder.decode(Uint8Array.from(completeResponse)),
  //         };
  //       }

  //       if (value) {
  //         console.log("\nnew value read within read function  --->");
  //         console.log(decoder.decode(Uint8Array.from(valueAsArray)));
  //         console.log("\n");
  //         console.log(
  //           `valueAsArray.includes(EOT) = ${valueAsArray.findIndex(
  //             (item) => item == 4
  //           )}`
  //         );
  //         console.log(
  //           `valueAsArray.includes(ACK) = ${valueAsArray.findIndex(
  //             (item) => item == 6
  //           )}`
  //         );
  //         console.log(
  //           `valueAsArray.includes(NAK) = ${valueAsArray.findIndex(
  //             (item) => item == 2
  //           )}`
  //         );
  //         completeResponse.push(...valueAsArray);
  //         allCapturedValues.push(...valueAsArray);

  //         // FOREVER, this will add all responses stx-etx to allResponses array
  //         if (completeResponse.includes(this.PAX_CONSTANTS.ETX)) {
  //           const indexBeforeETX = completeResponse.lastIndexOf(
  //             this.PAX_CONSTANTS.ETX
  //           );
  //           const STXIndex = completeResponse.lastIndexOf(
  //             this.PAX_CONSTANTS.STX
  //           );
  //           // console.warn(decoder.decode(Uint8Array.from(completeResponse)));
  //           console.log(
  //             "Complete response length BEFORE extraction using STX-ETX"
  //           );
  //           console.log(completeResponse.length);
  //           console.log();
  //           // (STXIndex + 3) to exclude unneeded bytes STX, status, separator
  //           completeResponse = completeResponse.slice(
  //             STXIndex + 3,
  //             indexBeforeETX
  //           );
  //           console.log(
  //             "Complete response length AFTER extraction using STX-ETX"
  //           );
  //           console.log(completeResponse.length);
  //           allResponses.push(
  //             decoder.decode(Uint8Array.from(completeResponse))
  //           );
  //           console.log("\nAll responses:");
  //           console.log(allResponses);
  //           console.log();

  //           console.log("\nAll captured values:");
  //           console.log(allCapturedValues);
  //           console.log();
  //           // await reader.cancel();
  //           // await reader.releaseLock();
  //           // return {
  //           //   success: "Success at reading",
  //           //   value: decoder.decode(Uint8Array.from(completeResponse)),
  //           // };
  //         }
  //       }
  //     } catch (error) {
  //       console.error("non fatal error occured");
  //       return { error: error };
  //     }
  //   }
  // };

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
    // console.log(response);

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
    amount = Array.from(amount);
    amount = [...amount, 0x30, 0x30];
    const numOfTimes = 9 - amount.length;

    for (let x = 0; x < numOfTimes; x++) {
      amount.unshift(0x30);
    }
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
      saleTransactionType: [0x30, 0x33], // auth transaction
      requestAmountInformation: [
        0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30,
      ],
      requestTraceInformation: [this.ECR_REFERENCE_NUMBER],
    };
    let response = await this.doCredit(doCreditFields);

    if (response?.error) {
      console.log("error occured");
      console.log(response.error);
      return { error: response.error };
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
    doCreditFields.saleTransactionType = [0x30, 0x34];
    doCreditFields.requestTraceInformation = [
      this.ECR_REFERENCE_NUMBER,
      0x1f,
      0x1f,
      0x1f,
      ...[
        0x30,
        0x30,
        0x30,
        ...Array.from(
          this.#convertToUint8Array(
            response.traceInformation.split(String.fromCharCode(0x1f))[0]
          )
        ),
      ],
    ];
    const zero = [0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30];
    doCreditFields.requestAmountInformation = [
      ...amount,
      0x1f,
      ...zero,
      0x1f,
      0x1f,
      0x1f,
      ...zero,
    ];
    function delay(ms) {
      return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    }
    console.log("Before delay");
    await delay(10000);
    console.log("After delay");
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
      ...(doCreditRequestOptions.saleTransactionType
        ? doCreditRequestOptions.saleTransactionType
        : ["na"]),
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
    let doCreditRequest = Uint8Array.from(
      doCreditRequestArray.filter((element) => element !== "na")
    );
    doCreditRequest = this.#lrcAppender(doCreditRequest);
    await this.write(doCreditRequest);
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
        VASInfromation,
        TORInformation,
        payloadData,
        hostCredentialInformation,
      ] = response.value.split(String.fromCharCode(0x1c));
      console.log(
        `\n\nDo credit command:\nCommand: ${command}\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\nTrace Information: ${traceInformation}\ntransaction type: ${transactionType}\n\n`
      );
      console.log(
        response.value
          .split(String.fromCharCode(0x1c))[4]
          .split(String.fromCharCode(0x1f))
      );
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
        console.log(response);
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

  clearBatch = async () => {
    let clearBatchCommand = new Uint8Array([
      this.PAX_CONSTANTS.STX,
      0x42,
      0x30,
      0x34,
      0x1c,
      ...this.PROTOCOL_VERSION,
      0x1c,
      this.PAX_CONSTANTS.ETX,
    ]);
    clearBatchCommand = this.#lrcAppender(clearBatchCommand);
    await this.write(clearBatchCommand);
    const response = await this.read();
    console.log(response);
  };
}
