// utils/ApiResponse.js
// Standard success response wrapper.
// Every successful API response must use this class.
//
// Shape:
// {
//   statusCode: 200,
//   success: true,
//   message: "Candidates fetched successfully",
//   data: { ... }
// }

class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.statusCode = statusCode;
    this.success = statusCode < 400;
    this.message = message;
    this.data = data;
  }
}

export { ApiResponse };