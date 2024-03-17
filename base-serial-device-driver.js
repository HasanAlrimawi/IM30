export class BaseDeviceSerialDriver {
  constructor(baudRate) {
    this.baudRate = baudRate;
  }

  baudRate;
  device = undefined;

  load() {}
  pay() {}

  setDeviceUnderUse = (device) => {
    this.device = device;
  };

  getDeviceUnderUse = () => {
    return this.device;
  };

  /**
   * @typedef {Object} FunctionalitySuccess
   * @property {string} success Success message conveys the success of the
   *     functionality
   */

  /**
   * @typedef {Object} FunctionalityFailure
   * @property {string} error Error message that conveys failure
   */

  /**
   * @typedef {Object} ReadingSuccess
   * @property {string} success Success message to convey success
   * @property {Uint8Array} value The value that has been retrieved from
   *     serial port
   */

  /**
   * Opens/connects the serial port selected.
   *
   * @returns {FunctionalitySuccess | FunctionalityFailure}
   */
  connectDevice = async () => {
    try {
      await this.device.open({ baudRate: this.baudRate });
      return {
        success: `Device was opened successfully`,
      };
    } catch (error) {
      console.log(error);
      return {
        error: `Couldn't open device ${error}`,
      };
    }
  };

  /**
   * Keeps on reading the serial port until there's nothing to read, or some
   *     fatal error occured.
   *
   * @returns {ReadingSuccess | FunctionalityFailure}
   */
  read = async () => {
    console.error("I shouldn't be called");
    const reader = this.device.readable.getReader();
    let completeResponse = [];
    while (true) {
      try {
        const { value, done } = await reader.read();
        const arrayValue = Array.from(value);
        if (done) {
          reader.releaseLock();
          console.error("finished reading");
          return {
            success: "Success at reading",
            value: Uint8Array(completeResponse),
          };
        }
        if (value) {
          completeResponse.push(...arrayValue);
        }
      } catch (error) {
        console.error("Error while listening");
        return { error: error };
      }
    }
  };

  write = async (data) => {
    const writer = this.device.writable.getWriter();
    console.log("started sending to terminal");
    await writer.write(data);
    console.log("finished sending to terminal");
    // await writer.cancel();
    await writer.releaseLock();
  };
}
