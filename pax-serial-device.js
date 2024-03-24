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
    this.PROTOCOL_VERSION = new Uint8Array([0x31, 0x2e, 0x34, 0x33]);
    this.ECR_REFERENCE_NUMBER = 0x31;
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

  read = async () => {
    const reader = this.device.readable.getReader();
    let completeResponse = [];
    const decoder = new TextDecoder();
    const allResponses = [];
    let receivedACK = false;
    let receivedNAK = false;
    let fullResponseReceived = false;
    const readingStartTime = new Date();
    let timeRegisterSentACK = undefined;
    let numberOfACKsRegisterSent = 0;

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
          // this if statement checks for ACK & NAK for 9 seconds
          if (!receivedACK) {
            const timeWithoutACK = new Date() - readingStartTime;
            receivedACK = valueAsArray.includes(this.PAX_CONSTANTS.ACK);
            receivedNAK = valueAsArray.includes(this.PAX_CONSTANTS.NAK);
            console.log(
              `-------------- Time without ACK: ${timeWithoutACK} --------------`
            );
            console.log(
              `-------------- Checking for ACK: ${receivedACK} --------------`
            );
            console.log(
              `-------------- Checking for NAK: ${receivedNAK} --------------`
            );
            // checks if NAK received from terminal then it stops reading and
            // the app should resend the command, then checks if ACK received
            // from terminal so it can proceed with reading
            if (receivedNAK) {
              await reader.releaseLock();
              return {
                error:
                  "terminal received corrupted command, check command and send again",
                tryAgain: true,
              };
            } else if (!receivedACK && timeWithoutACK > 7000) {
              await reader.releaseLock();
              return {
                error: "ack can not be recieved",
                tryAgain: true,
              };
            } else if (!receivedACK) {
              continue;
            }
          }

          const EOTIndex = valueAsArray.findIndex(
            (item) => item == this.PAX_CONSTANTS.EOT
          );
          console.log(`-------------- EOT index: ${EOTIndex} --------------`);

          if (EOTIndex >= 0) {
            await reader.releaseLock();
            console.log(completeResponse.includes(0x00));
            completeResponse = completeResponse.filter(
              (character) => character !== 0x00
            );
            console.log(completeResponse.includes(0x00));
            console.log(Uint8Array.from(completeResponse).toString());
            console.log(decoder.decode(Uint8Array.from(completeResponse)));
            return {
              success: "Success at reading",
              value: decoder.decode(Uint8Array.from(completeResponse)),
            };
          }

          // checks if register sent ack, if yes then if it has been for more
          // than 3 seconds and no EOT received then resend ack but if ack has
          // been sent for more than 7 times then there's miscommunication
          if (timeRegisterSentACK) {
            const timeFromLastACKRegisterSent =
              new Date() - timeRegisterSentACK;
            console.log(
              `-------------- timeFromLastACKRegisterSent: ${timeFromLastACKRegisterSent} --------------`
            );
            if (numberOfACKsRegisterSent >= 7) {
              await reader.releaseLock();
              return {
                error:
                  "There's miscommunication, check communication and try again",
                tryAgain: false,
              };
            }
            if (timeFromLastACKRegisterSent >= 3000) {
              await this.write(new Uint8Array([this.PAX_CONSTANTS.ACK]));
              timeRegisterSentACK = new Date();
              numberOfACKsRegisterSent++;
            }
            console.log(
              `-------------- numberOfACKsRegisterSent: ${numberOfACKsRegisterSent} --------------`
            );
          }

          completeResponse.push(...valueAsArray);
          // FOREVER, this will add all responses stx-etx to allResponses array
          if (
            completeResponse.includes(this.PAX_CONSTANTS.ETX) &&
            !fullResponseReceived
          ) {
            const ETXIndex = completeResponse.lastIndexOf(
              this.PAX_CONSTANTS.ETX
            );
            const STXIndex = completeResponse.lastIndexOf(
              this.PAX_CONSTANTS.STX
            );
            // console.warn(decoder.decode(Uint8Array.from(completeResponse)));
            console.log("Complete response BEFORE extraction using STX-ETX");
            console.log(
              new Uint8Array(
                completeResponse.slice(STXIndex, ETXIndex + 2)
              ).toString()
            );
            console.log(`LRC value = ${completeResponse[ETXIndex + 1]}`);

            // ToDo: check LRC is correct, if yes then update fullResponseReceived flag and send ack then wait for EOT,
            //    if not then send NAK and clear the completeResponse variable

            // (STXIndex + 3) to exclude unneeded bytes STX, status, separator
            completeResponse = completeResponse.slice(STXIndex + 3, ETXIndex);
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
            timeRegisterSentACK = new Date();
            numberOfACKsRegisterSent++;
            fullResponseReceived = true; // to be deleted when lrc checking is added
          }
        }
      } catch (error) {
        console.error("Some exception has been thrown");
        console.error(error);
        return { error: error, tryAgain: false };
      }
    }
  };

  //the below one also checks for EOT but send ACK as soon as complete response STX-ETX has been discovered.
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
  //   const allResponsesExtracted = [];
  //   let receivedACK = false;
  //   let receivedNAK = false;
  //   let fullResponseReceived = false;
  //   const readingStartTime = new Date();
  //   let timeRegisterSentACK = undefined;
  //   let numberOfACKsRegisterSent = 0;

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
  //           success: true,
  //           value: decoder.decode(Uint8Array.from(completeResponse)),
  //         };
  //       }

  //       if (value) {
  //         console.log("\nnew value read within read function  --->");
  //         console.log(decoder.decode(Uint8Array.from(valueAsArray)));
  //         console.log("\n");
  //         // this if statement checks for ACK & NAK for 9 seconds
  //         if (!receivedACK) {
  //           const timeWithoutACK = new Date() - readingStartTime;
  //           receivedACK = valueAsArray.includes(this.PAX_CONSTANTS.ACK);
  //           receivedNAK = valueAsArray.includes(this.PAX_CONSTANTS.NAK);
  //           console.log(
  //             `-------------- Time without ACK: ${timeWithoutACK} --------------`
  //           );
  //           console.log(
  //             `-------------- Checking for ACK: ${receivedACK} --------------`
  //           );
  //           console.log(
  //             `-------------- Checking for NAK: ${receivedNAK} --------------`
  //           );
  //           // checks if NAK received from terminal then it stops reading and
  //           // the app should resend the command, then checks if ACK received
  //           // from terminal so it can proceed with reading
  //           if (receivedNAK) {
  //             await reader.releaseLock();
  //             return {
  //               error: true,
  //               tryAgain: true,
  //               message:
  //                 "terminal received corrupted command, check command and send again.",
  //             };
  //           } else if (!receivedACK && timeWithoutACK > 7000) {
  //             await reader.releaseLock();
  //             return {
  //               error: true,
  //               tryAgain: true,
  //               message:
  //                 "Acknowledge from terminal can not be recieved.\n'Communication issue.'",
  //             };
  //           } else if (!receivedACK) {
  //             continue;
  //           }
  //         }

  //         const EOTIndex = valueAsArray.findIndex(
  //           (item) => item == this.PAX_CONSTANTS.EOT
  //         );
  //         console.log(`-------------- EOT index: ${EOTIndex} --------------`);

  //         if (EOTIndex >= 0) {
  //           await reader.releaseLock();
  //           console.log(Uint8Array.from(completeResponse).toString());
  //           console.log(decoder.decode(Uint8Array.from(completeResponse)));
  //           return {
  //             success: true,
  //             value: decoder.decode(Uint8Array.from(completeResponse)),
  //           };
  //         }

  //         // checks if register sent ack, if yes then if it has been for more
  //         // than 3 seconds and no EOT received then resend ack but if ack has
  //         // been sent for more than 7 times then there's miscommunication
  //         if (timeRegisterSentACK) {
  //           const timeFromLastACKRegisterSent =
  //             new Date() - timeRegisterSentACK;
  //           console.log(
  //             `-------------- timeFromLastACKRegisterSent: ${timeFromLastACKRegisterSent} --------------`
  //           );
  //           if (numberOfACKsRegisterSent >= 7) {
  //             await reader.releaseLock();
  //             return {
  //               error: true,
  //               tryAgain: false,
  //               messsage:
  //                 "There's miscommunication, check communication and try again.\n'Didn't receive EOT.'",
  //             };
  //           }
  //           if (timeFromLastACKRegisterSent >= 3000) {
  //             console.log("it has been more than 3 seconds");
  //             await this.write(new Uint8Array([this.PAX_CONSTANTS.ACK]));
  //             timeRegisterSentACK = new Date();
  //             numberOfACKsRegisterSent++;
  //           }
  //           console.log(
  //             `-------------- numberOfACKsRegisterSent: ${numberOfACKsRegisterSent} --------------`
  //           );
  //         }

  //         completeResponse.push(...valueAsArray);
  //         // FOREVER, this will add all responses stx-etx to allResponsesExtracted array
  //         if (
  //           completeResponse.includes(this.PAX_CONSTANTS.ETX) &&
  //           !fullResponseReceived
  //         ) {
  //           const ETXIndex = completeResponse.lastIndexOf(
  //             this.PAX_CONSTANTS.ETX
  //           );
  //           const STXIndex = completeResponse.lastIndexOf(
  //             this.PAX_CONSTANTS.STX
  //           );
  //           // console.warn(decoder.decode(Uint8Array.from(completeResponse)));
  //           console.log("Complete response BEFORE extraction using STX-ETX");
  //           console.log(
  //             new Uint8Array(
  //               completeResponse.slice(STXIndex, ETXIndex + 2)
  //             ).toString()
  //           );
  //           console.log(`LRC value = ${completeResponse[ETXIndex + 1]}`);

  //           // ToDo: check LRC is correct, if yes then update fullResponseReceived flag and send ack then wait for EOT,
  //           //    if not then send NAK and clear the completeResponse variable
  //           // const isCorrupt = this.isResponseCorrupt(
  //           //   completeResponse.slice(STXIndex, ETXIndex + 2)
  //           // );

  //           // if (isCorrupt) {
  //           //   completeResponse = [];
  //           //   await this.write(new Uint8Array([this.PAX_CONSTANTS.NAK]));
  //           //   fullResponseReceived = false;
  //           //   continue;
  //           // }
  //           // if (completeResponse[STXIndex + 1] == 0x31) {
  //           //   allResponsesExtracted.push(
  //           //     ...completeResponse.slice(STXIndex + 3, ETXIndex)
  //           //   );
  //           //   await this.write(new Uint8Array([this.PAX_CONSTANTS.ACK]));
  //           // }
  //           // (STXIndex + 3) to exclude unneeded bytes STX, status, separator
  //           completeResponse = completeResponse.slice(STXIndex + 3, ETXIndex);
  //           console.log(
  //             "Complete response length AFTER extraction using STX-ETX"
  //           );
  //           console.log(completeResponse.length);
  //           allResponsesExtracted.push(
  //             decoder.decode(Uint8Array.from(completeResponse))
  //           );
  //           console.log("\nAll responses:");
  //           console.log(allResponsesExtracted);
  //           console.log();
  //           await this.write(new Uint8Array([this.PAX_CONSTANTS.ACK]));
  //           timeRegisterSentACK = new Date();
  //           numberOfACKsRegisterSent++;
  //           fullResponseReceived = true; // to be deleted when lrc checking is added
  //         }
  //       }
  //     } catch (error) {
  //       console.error("Some exception has been thrown");
  //       console.error(error);
  //       return { error: true, tryAgain: false, message: error };
  //     }
  //   }
  // };

  // read = async () => {
  //   const reader = this.device.readable.getReader();
  //   let completeResponse = [];
  //   const decoder = new TextDecoder();
  //   const allResponsesExtracted = [];
  //   let receivedACK = false;
  //   let receivedNAK = false;
  //   let fullResponseReceived = false;
  //   const readingStartTime = new Date();
  //   let timeRegisterSentACK = undefined;
  //   let numberOfACKsRegisterSent = 0;

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
  //           success: true,
  //           value: decoder.decode(Uint8Array.from(completeResponse)),
  //         };
  //       }

  //       if (value) {
  //         console.log("\nnew value read within read function  --->");
  //         console.log(decoder.decode(Uint8Array.from(valueAsArray)));
  //         console.log("\n");
  //         // this if statement checks for ACK & NAK for 9 seconds
  //         if (!receivedACK) {
  //           const timeWithoutACK = new Date() - readingStartTime;
  //           receivedACK = valueAsArray.includes(this.PAX_CONSTANTS.ACK);
  //           receivedNAK = valueAsArray.includes(this.PAX_CONSTANTS.NAK);
  //           console.log(
  //             `-------------- Time without ACK: ${timeWithoutACK} --------------`
  //           );
  //           console.log(
  //             `-------------- Checking for ACK: ${receivedACK} --------------`
  //           );
  //           console.log(
  //             `-------------- Checking for NAK: ${receivedNAK} --------------`
  //           );
  //           // checks if NAK received from terminal then it stops reading and
  //           // the app should resend the command, then checks if ACK received
  //           // from terminal so it can proceed with reading
  //           if (receivedNAK) {
  //             await reader.releaseLock();
  //             return {
  //               error: true,
  //               tryAgain: true,
  //               message:
  //                 "terminal received corrupted command, check command and send again.",
  //             };
  //           } else if (!receivedACK && timeWithoutACK > 7000) {
  //             await reader.releaseLock();
  //             return {
  //               error: true,
  //               tryAgain: true,
  //               message:
  //                 "Acknowledge from terminal can not be recieved.\n'Communication issue.'",
  //             };
  //           } else if (!receivedACK) {
  //             continue;
  //           }
  //         }

  //         const EOTIndex = valueAsArray.findIndex(
  //           (item) => item == this.PAX_CONSTANTS.EOT
  //         );
  //         console.log(`-------------- EOT index: ${EOTIndex} --------------`);

  //         if (EOTIndex >= 0) {
  //           await reader.releaseLock();
  //           console.log(Uint8Array.from(allResponsesExtracted).toString());
  //           console.log(decoder.decode(Uint8Array.from(allResponsesExtracted)));
  //           return {
  //             success: true,
  //             value: decoder.decode(Uint8Array.from(allResponsesExtracted)),
  //           };
  //         }

  //         // checks if register sent ack in order to receive EOT, if yes then
  //         // if it has been for more than 3 seconds and no EOT received then
  //         // resend ack but if ack has been sent for more than 7 times
  //         // then there's miscommunication
  //         if (timeRegisterSentACK) {
  //           const timeFromLastACKRegisterSent =
  //             new Date() - timeRegisterSentACK;
  //           console.log(
  //             `-------------- timeFromLastACKRegisterSent: ${timeFromLastACKRegisterSent} --------------`
  //           );
  //           if (numberOfACKsRegisterSent >= 7) {
  //             await reader.releaseLock();
  //             return {
  //               error: true,
  //               tryAgain: false,
  //               messsage:
  //                 "There's miscommunication, check communication and try again.\n'Didn't receive EOT.'",
  //             };
  //           }
  //           if (timeFromLastACKRegisterSent >= 3000) {
  //             await this.write(new Uint8Array([this.PAX_CONSTANTS.ACK]));
  //             timeRegisterSentACK = new Date();
  //             numberOfACKsRegisterSent++;
  //           }
  //           console.log(
  //             `-------------- numberOfACKsRegisterSent: ${numberOfACKsRegisterSent} --------------`
  //           );
  //         }

  //         completeResponse.push(...valueAsArray);
  //         // FOREVER, this will add all responses to allResponsesExtracted array
  //         if (
  //           completeResponse.includes(this.PAX_CONSTANTS.ETX) &&
  //           !fullResponseReceived
  //         ) {
  //           const ETXIndex = valueAsArray.lastIndexOf(this.PAX_CONSTANTS.ETX);
  //           const STXIndex = completeResponse.lastIndexOf(
  //             this.PAX_CONSTANTS.STX
  //           );
  //           console.log("Complete response BEFORE extraction using STX-ETX");
  //           console.log(
  //             new Uint8Array(
  //               completeResponse.slice(STXIndex, ETXIndex + 2)
  //             ).toString()
  //           );
  //           console.log(`LRC value = ${completeResponse[ETXIndex + 1]}`);
  //           // ToDo: check LRC is correct, if yes then update fullResponseReceived flag and send ack then wait for EOT,
  //           //    if not then send NAK and clear the completeResponse variable
  //           const isCorrupt = this.isResponseCorrupt(
  //             completeResponse.slice(STXIndex, ETXIndex + 2)
  //           );

  //           if (isCorrupt) {
  //             console.log("corrupt response received");
  //             completeResponse = [];
  //             await this.write(new Uint8Array([this.PAX_CONSTANTS.NAK]));
  //             fullResponseReceived = false;
  //             continue;
  //           }
  //           // [STXIndex + 1] is index of the status that tells there are more
  //           // responses if its value is 1
  //           if (completeResponse[STXIndex + 1] == 0x31) {
  //             allResponsesExtracted.push(
  //               ...completeResponse.slice(STXIndex + 3, ETXIndex)
  //             );
  //             await this.write(new Uint8Array([this.PAX_CONSTANTS.ACK]));
  //             completeResponse = [];
  //             continue;
  //           }
  //           // (STXIndex + 3) to exclude unneeded bytes STX, status, separator
  //           completeResponse = completeResponse.slice(STXIndex + 3, ETXIndex);
  //           console.log(
  //             "Complete response length AFTER extraction using STX-ETX"
  //           );
  //           console.log(completeResponse.length);
  //           allResponsesExtracted.push(
  //             ...completeResponse.slice(STXIndex + 3, ETXIndex)
  //           );
  //           console.log("\nAll responses:");
  //           console.log(allResponsesExtracted);
  //           console.log();
  //           await this.write(new Uint8Array([this.PAX_CONSTANTS.ACK]));
  //           timeRegisterSentACK = new Date();
  //           numberOfACKsRegisterSent++;
  //           fullResponseReceived = true;
  //         }
  //       }
  //     } catch (error) {
  //       console.error("Some exception has been thrown");
  //       console.error(error);
  //       return { error: true, tryAgain: false, message: error };
  //     }
  //   }
  // };

  /**
   * Checks if the response extracted is complete or corrupted by checking LRC
   *     byte if it's correct and if status byte is in its correct place.
   *
   * @param {string[]} response Represents the response captured by read
   *     function, where the response includes STX, ETX, LRC bytes
   * @returns {boolean} Indicates whether the response is correct
   *     or wrong/corrupted
   */
  isResponseCorrupt = (response) => {
    const responseWithCorrectLRC = this.#lrcAppender(
      new Uint8Array(response.slice(0, response.length - 1))
    );
    if (JSON.stringify(response) === JSON.stringify(responseWithCorrectLRC)) {
      if (response.indexOf(0x1c) !== 2) {
        return true;
      }
      return false;
    } else {
      return true;
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
   * Responsible for sending the passed command to the PAX device and checks
   *     for the response to resend the command if needed, and at last returns
   *     the final response.
   *
   * @param {Uint8Array} command Represents the command to send for PAX device
   * @returns { | }
   */
  sendCommand = async (command) => {
    const counter = 0;
    let response = undefined;
    while (counter < 3) {
      await this.write(command);
      const response = this.read();

      if (!response.tryAgain) {
        return response;
      }
      counter++;
    }
    return response;
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
        success: true,
        command,
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
      console.log("Init failed, Error is: ");
      console.log(response);
      return {
        error: true,
        message: response.message,
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
    // [1c] means <FS> which is the separator of request/response fields
    // [1f] means <US> which is the separator of the request amount information
    amount = this.#convertToUint8Array(amount);
    amount = Array.from(amount);
    amount = [...amount];

    // For auth type, amount should be zero
    let doCreditFields = {
      saleTransactionType: [0x30, 0x33], // auth transaction
      requestAmountInformation: [0x30],
      requestTraceInformation: [this.ECR_REFERENCE_NUMBER],
    };
    let response = await this.doCredit(doCreditFields);
    console.log(response);

    if (response?.error) {
      return { error: response.message, stage: "Auth" };
    } else if (response?.responseCode != "000000") {
      return {
        error: response.responseMessage,
        stage: "Auth",
      };
    }
    // ---------  Post auth  ---------
    doCreditFields.saleTransactionType = [0x30, 0x34];
    doCreditFields.requestTraceInformation = [
      this.ECR_REFERENCE_NUMBER,
      0x1f,
      0x1f,
      0x1f,
      ...Array.from(
        this.#convertToUint8Array(
          response.traceInformation.split(String.fromCharCode(0x1f))[0]
        )
      ),
    ];
    console.log(
      this.#convertToUint8Array(
        response.traceInformation.split(String.fromCharCode(0x1f))[0]
      )
    );
    console.log(
      this.#convertToUint8Array(
        response.traceInformation.split(String.fromCharCode(0x1f))
      )
    );
    const zero = [0x30];
    doCreditFields.requestAmountInformation = [
      ...amount,
      0x1f,
      ...zero,
      0x1f,
      0x1f,
      0x1f,
      ...zero,
    ];
    // function delay(ms) {
    //   return new Promise((resolve) => {
    //     setTimeout(resolve, ms);
    //   });
    // }
    // console.log("Before delay");
    // await delay(10000);
    // console.log("After delay");
    response = await this.doCredit(doCreditFields);
    console.log(response);

    if (response?.error) {
      return { error: true, message: response.message, stage: "Post Auth" };
    } else if (response?.responseCode != "000000") {
      return {
        error: response.responseMessage,
        stage: "Post Auth",
      };
    }
    return {
      success: response.responseMessage,
      responseCode: response.responseCode,
      responseMessage: response.responseMessage,
      traceInformation: response.traceInformation.split(
        String.fromCharCode(0x1f)
      ),
      accountInformation: response.accountInformation.split(
        String.fromCharCode(0x1f)
      ),
      amountInformation: response.amountInformation.split(
        String.fromCharCode(0x1f)
      ),
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
    console.log(doCreditRequest);
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
      return {
        success: true,
        command,
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
    } else if (response?.error) {
      console.log("Couldn't do credit, Error is:");
      console.log(response);
      return { error: true, message: response.message };
    }
  };

  // getInputAccount = async () => {
  //   // const getInputCommand = `${this.PAX_CONSTANTS.STX}A30[1c]${this.PROTOCOL_VERSION}[1c]1[1c]1[1c]1[1c]1[1c][1c][200][1c][1c][1c][1c][1c]01[1c]01[1c][1c]${this.PAX_CONSTANTS.ETX}J`;
  //   let getInputCommand = new Uint8Array([
  //     this.PAX_CONSTANTS.STX,
  //     0x41,
  //     0x33,
  //     0x30,
  //     0x1c,
  //     ...this.PROTOCOL_VERSION,
  //     0x1c,
  //     0x31,
  //     0x1c,
  //     0x30,
  //     0x1c,
  //     0x31,
  //     0x1c,
  //     0x31,
  //     0x1c,
  //     0x1c,
  //     0x32,
  //     0x30,
  //     0x30,
  //     0x1c,
  //     0x1c,
  //     0x1c,
  //     0x1c,
  //     0x1c,
  //     0x30,
  //     0x31,
  //     0x1c,
  //     0x30,
  //     0x31,
  //     0x1c,
  //     0x1c,
  //     this.PAX_CONSTANTS.ETX,
  //   ]);
  //   getInputCommand = this.#lrcAppender(getInputCommand);
  //   await this.write(getInputCommand);
  //   const response = await this.read();

  //   if (response?.success) {
  //     const [
  //       command,
  //       version,
  //       responseCode,
  //       responseMessage,
  //       entryMode,
  //       trackOneData,
  //       trackTwoData,
  //       trackThreeData,
  //       PAN,
  //       expiryDate,
  //       QRCode,
  //       KSN,
  //       additionalInformation,
  //     ] = response.value.split(String.fromCharCode(0x1c));
  //     console.log(
  //       `Get input account command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
  //     );

  //     return {
  //       success: "success",
  //       exp: expiryDate,
  //       cc: PAN,
  //     };
  //   } else if (response?.error) {
  //     console.log("Couldn't get input account");
  //   }
  // };

  /**
   * Shows a message on the PAX device display.
   *
   * @param {{title: string, body: string}} message Represents the message
   *     to be shown on the PAX device
   */
  showMessage = async (message) => {
    const messageBody = this.#convertToUint8Array(message.body);
    const messageTitle = this.#convertToUint8Array(message.title);
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
    console.log(`Show message response: `);
    console.log(response);
    if (response?.success) {
      const [command, version, responseCode, responseMessage] =
        response.value.split(String.fromCharCode(0x1c));
      console.log(
        `Show message command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );
      return {
        success: true,
        command,
        responseCode: responseCode,
        responseMessage: responseMessage,
      };
    } else if (response?.error) {
      console.log("Couldn't show message");
      return {
        error: true,
        message: response.message,
      };
    }
  };

  // TODO address it
  clearMessage = async () => {
    // const clearMessageCommand = `${this.PAX_CONSTANTS.STX}A12[1c]${this.PROTOCOL_VERSION}${this.PAX_CONSTANTS.ETX}K`;
    let clearMessageCommand = new Uint8Array([
      this.PAX_CONSTANTS.STX,
      0x41,
      0x31,
      0x32,
      0x1c,
      ...this.PROTOCOL_VERSION,
      this.PAX_CONSTANTS.ETX,
    ]);
    clearMessageCommand = this.#lrcAppender(clearMessageCommand);
    await this.write(clearMessageCommand);
    const response = await this.read();
    if (response?.success) {
      const [command, version, responseCode, responseMessage] =
        response.value.split("[1c]");
      console.log(
        `Clear message command:\nResponse code: ${responseCode}\nResponseMessage: ${responseMessage}\n\n`
      );
      return {
        success: true,
        command,
        responseCode,
        responseMessage,
      };
    } else if (response?.error) {
      console.log("Clear message failed");
      console.log(response.message);
      return { error: true, message: response.message };
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
    console.log("Clear batch response");
    console.log(response);

    if (response?.success) {
      const [
        command,
        version,
        responseCode,
        responseMessage,
        additionalInformation,
        TORInformation,
      ] = response.value.split(String.fromCharCode(0x1c));
      console.log("CLEAR BATCH: I'm returning success");
      return {
        success: true,
        responseCode: responseCode,
        responseMessage: responseMessage,
        additionalInformation,
        TORInformation,
      };
    } else if (response?.error) {
      return {
        error: true,
        message: response.message,
      };
    }
  };
}
