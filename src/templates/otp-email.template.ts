export const getOtpEmailTemplate = ({ otp }: { otp: string }) => {
  return `<p>Your OTP is <b>${otp}</b>. It expires in 5 minutes.</p>`
}
