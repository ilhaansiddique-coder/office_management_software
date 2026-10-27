import { describe, expect, it } from "vitest";
import {
  getDefaultPaymentStatus,
  getPaymentTermsLabel,
  validateCreditDays,
} from "./paymentTerms";

describe("payment terms", () => {
  it("returns the label for each supported term", () => {
    expect(getPaymentTermsLabel("immediate")).toBe("Pay Now");
    expect(getPaymentTermsLabel("cod")).toBe("Cash on Delivery (COD)");
    expect(getPaymentTermsLabel("credit")).toBe("Pay Later");
  });

  it("determines payment status from amounts paid", () => {
    expect(getDefaultPaymentStatus("immediate", 100, 100)).toBe("paid");
    expect(getDefaultPaymentStatus("cod", 25, 100)).toBe("partial");
    expect(getDefaultPaymentStatus("credit", 0, 100)).toBe("pending");
  });

  it("accepts only whole-number credit periods from 1 to 365 days", () => {
    expect(validateCreditDays(1)).toBe(true);
    expect(validateCreditDays(365)).toBe(true);
    expect(validateCreditDays(0)).toBe(false);
    expect(validateCreditDays(366)).toBe(false);
    expect(validateCreditDays(1.5)).toBe(false);
  });
});
