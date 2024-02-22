export class BaseDeviceUsbDriver {
  constructor(
    vid,
    pid,
    deviceInterface,
    deviceConfiguration,
    readEndpoint,
    writeEndpoint
  ) {
    this.vid = vid;
    this.pid = pid;
    this.interface = deviceInterface;
    this.configuration = deviceConfiguration;
    this.readEndpoint = readEndpoint;
    this.writeEndpoint = writeEndpoint;
  }

  pid;
  vid;
  interface;
  configuration;
  readEndpoint;
  writeEndpoint;
  #device = undefined;

  load() {}
  pay() {}

  setDeviceUnderUse = (device) => {
    this.#device = device;
  };

  getDeviceUnderUse = () => {
    return this.#device;
  };

  connectDevice = async () => {
    try {
      await this.#device.open();
    } catch (error) {
      console.log(error);
      return {
        error: `Couldn't open device ${error}`,
      };
    }
    try {
      // await this.#device.selectConfiguration(this.configuration);
    } catch (error) {
      console.log(error);
      return {
        error: `Couldn't select device configuration ${error}`,
      };
    }
    try {
      await this.#device.claimInterface(this.interface);
    } catch (error) {
      console.log(error);
      return {
        error: `Couldn't claim device interface ${error}`,
      };
    }
  };

  listen = async () => {
    let result = await this.#device.transferIn(this.readEndpoint, 32);
    console.log(result);
    const decoder = new TextDecoder();
    let message = decoder.decode(result.data);
    console.log(message);
    return message;
  };

  sendData = async (data) => {
    const encoder = new TextEncoder();
    // const transferOutResult = await this.#device.transferOut(
    //   this.writeEndpoint,
    //   encoder.encode(data).buffer
    // );
    const transferOutResult = await this.#device.transferOut(
      this.writeEndpoint,
      data
    );
    console.log(transferOutResult);
  };
}
