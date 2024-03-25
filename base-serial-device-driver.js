export class BaseDeviceSerialDriver {
  constructor(baudRate) {
    this.baudRate = baudRate;
  }

  baudRate;
  device = undefined;

  load() {}
  pay() {}

  /**
   * Sets the serial port selected by the user, to enable adding event
   *     listeners or get readers or writers for the serial port.
   *
   * @param {SerialPort} device The serial port selected by user
   */
  setDeviceUnderUse = (device) => {
    this.device = device;
  };

  /**
   * Returns serial port under use.
   *
   * @returns {SerialPort}
   */
  getDeviceUnderUse = () => {
    return this.device;
  };

  /**
   * @typedef {Object} FunctionalitySuccess
   * @property {boolean} success Conveys the success of the functionality
   */

  /**
   * @typedef {Object} ErrorObject
   * @property {boolean} error Conveys failure
   * @property {string} message Includes information about error
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
   * @returns {FunctionalitySuccess | ErrorObject}
   */
  connectDevice = async () => {
    try {
      await this.device.open({ baudRate: this.baudRate });
      return {
        success: true,
      };
    } catch (error) {
      console.log(error);
      return {
        error: true,
        message: `Couldn't open device ${error}`,
      };
    }
  };

  /**
   * Keeps on reading the serial port until there's nothing to read, or some
   *     fatal error occured.
   *
   * @returns {ReadingSuccess | ErrorObject}
   */
  read = async () => {
    const reader = this.device.readable.getReader();
    let completeResponse = [];
    while (true) {
      try {
        const { value, done } = await reader.read();
        const arrayValue = Array.from(value);
        if (done) {
          reader.releaseLock();
          console.log("finished reading");
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
        return { error: true, message: error };
      }
    }
  };

  /**
   * Sends/writes the data or command passed through to the connected serial
   *     port.
   *
   * @param {Uint8Array} data Represents the data that sould be sent to the
   *     serial port connected
   */
  write = async (data) => {
    // TODO: Wrap with tryCatch
    try {
      const writer = this.device.writable.getWriter();
      console.log("started sending to terminal");
      await writer.write(data);
      console.log("finished sending to terminal");
      await writer.releaseLock();
    } catch (error) {
      console.error(error);
    }
  };
}
