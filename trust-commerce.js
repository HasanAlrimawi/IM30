/**
 * @fileoverview This provides the functionality of making transactions
 * by passing the client's card details to the payment gateway, rather than
 * letting the terminal pass the card details.
 */
export const trustCommerceAPIs = (function () {
  const payByTrustCommerce = async (amount, cc, exp) => {
    return await fetch(`https://drab-puce-ladybug-coat.cyclic.app/tc-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `custid=1346300&password=alnidEs1&action=sale&amount=${amount}&cc=${cc}&exp=${exp}&demo=y`,
    })
      .then((res) => {
        return res.text();
      })
      .then((text) => {
        return this.textToJSON(text);
      });
  };

  return {
    payByTrustCommerce,
  };
})();
