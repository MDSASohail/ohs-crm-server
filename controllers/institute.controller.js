// controllers/institute.controller.js
// Handles all institute management operations.
//
// Routes:
// POST   /api/institutes                        — create institute (root, admin)
// GET    /api/institutes                        — list all institutes (all roles)
// GET    /api/institutes/:id                    — get single institute (all roles)
// PUT    /api/institutes/:id                    — update institute (root, admin)
// DELETE /api/institutes/:id                    — soft delete (root, admin)
// PUT    /api/institutes/:id/deactivate         — deactivate (root, admin)
// PUT    /api/institutes/:id/activate           — activate (root, admin)
// POST   /api/institutes/:id/contacts           — add contact person (root, admin)
// PUT    /api/institutes/:id/contacts/:contactId   — update contact (root, admin)
// DELETE /api/institutes/:id/contacts/:contactId   — remove contact (root, admin)
// POST   /api/institutes/:id/courses            — add course offered (root, admin)
// PUT    /api/institutes/:id/courses/:courseOfferedId — update course offered (root, admin)
// DELETE /api/institutes/:id/courses/:courseOfferedId — remove course offered (root, admin)
//
// Design decisions:
// — avgResultDays is never set manually — it is
//   calculated automatically from enrollment data
//   and updated by the enrollment controller
// — Contacts and courses offered are subdocuments —
//   managed via dedicated endpoints for clarity

import Institute from "../models/Institute.model.js";
import Course from "../models/Course.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLogger.js";

// ─────────────────────────────────────────
// @route   POST /api/institutes
// @access  Root, Admin
// @desc    Create a new institute
// ─────────────────────────────────────────
const createInstitute = asyncHandler(async (req, res) => {
  const {
    name,
    address,
    email,
    mobile,
    notes,
    contacts = [],
    coursesOffered = [],
  } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, "Institute name is required");
  }

  // Validate coursesOffered if provided
  if (coursesOffered.length > 0) {
    for (const co of coursesOffered) {
      if (!co.courseId) {
        throw new ApiError(400, "Each course offered must have a courseId");
      }

      // Verify course exists in this tenant
      const course = await Course.findOne({
        _id: co.courseId,
        tenantId: req.tenantId,
        isDeleted: false,
      });

      if (!course) {
        throw new ApiError(404, `Course not found: ${co.courseId}`);
      }
    }
  }

  const institute = await Institute.create({
    tenantId: req.tenantId,
    name: name.trim(),
    address: address?.trim() || null,
    email: email?.toLowerCase().trim() || null,
    mobile: mobile?.trim() || null,
    notes: notes?.trim() || null,
    contacts,
    coursesOffered,
    isActive: true,
  });

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CREATE_INSTITUTE",
    entityType: "institute",
    entityId: institute._id,
    description: `${req.user.name} created institute ${institute.name}`,
  });

  return res.status(201).json(
    new ApiResponse(201, institute, "Institute created successfully")
  );
});

// ─────────────────────────────────────────
// @route   GET /api/institutes
// @access  All roles
// @desc    List all institutes in the tenant
//          Supports optional query params:
//          ?active=true/false — filter by active status
//          Root sees deleted institutes too
// ─────────────────────────────────────────
const getInstitutes = asyncHandler(async (req, res) => {
  const { active } = req.query;

  const filter = { tenantId: req.tenantId };

  // Non-root users never see deleted institutes
  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  if (active !== undefined) {
    filter.isActive = active === "true";
  }

  const institutes = await Institute.find(filter)
    .populate("coursesOffered.courseId", "name shortCode")
    .sort({ isDeleted: 1, isActive: -1, name: 1 });

  return res.status(200).json(
    new ApiResponse(200, institutes, "Institutes fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   GET /api/institutes/:id
// @access  All roles
// @desc    Get a single institute by ID
// ─────────────────────────────────────────
const getInstituteById = asyncHandler(async (req, res) => {
  const filter = {
    _id: req.params.id,
    tenantId: req.tenantId,
  };

  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  const institute = await Institute.findOne(filter).populate(
    "coursesOffered.courseId",
    "name shortCode"
  );

  if (!institute) {
    throw new ApiError(404, "Institute not found");
  }

  return res.status(200).json(
    new ApiResponse(200, institute, "Institute fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/institutes/:id
// @access  Root, Admin
// @desc    Update institute core details
//          Does not touch contacts or coursesOffered
//          — use their dedicated endpoints for those
// ─────────────────────────────────────────
const updateInstitute = asyncHandler(async (req, res) => {
  const { name, address, email, mobile, notes } = req.body;

  const institute = await Institute.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!institute) {
    throw new ApiError(404, "Institute not found");
  }

  const updates = {};

  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, "Institute name cannot be empty");
    updates.name = name.trim();
  }
  if (address !== undefined) updates.address = address?.trim() || null;
  if (email !== undefined) updates.email = email?.toLowerCase().trim() || null;
  if (mobile !== undefined) updates.mobile = mobile?.trim() || null;
  if (notes !== undefined) updates.notes = notes?.trim() || null;

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const updatedInstitute = await Institute.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  ).populate("coursesOffered.courseId", "name shortCode");

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_INSTITUTE",
    entityType: "institute",
    entityId: updatedInstitute._id,
    description: `${req.user.name} updated institute ${updatedInstitute.name}`,
    metadata: { updates },
  });

  return res.status(200).json(
    new ApiResponse(200, updatedInstitute, "Institute updated successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/institutes/:id/deactivate
// @access  Root, Admin
// @desc    Deactivate an institute
// ─────────────────────────────────────────
const deactivateInstitute = asyncHandler(async (req, res) => {
  const institute = await Institute.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId, isDeleted: false },
    { $set: { isActive: false } },
    { new: true }
  );

  if (!institute) {
    throw new ApiError(404, "Institute not found");
  }

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DEACTIVATE_INSTITUTE",
    entityType: "institute",
    entityId: institute._id,
    description: `${req.user.name} deactivated institute ${institute.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, institute, "Institute deactivated successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/institutes/:id/activate
// @access  Root, Admin
// @desc    Reactivate a deactivated institute
// ─────────────────────────────────────────
const activateInstitute = asyncHandler(async (req, res) => {
  const institute = await Institute.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId, isDeleted: false },
    { $set: { isActive: true } },
    { new: true }
  );

  if (!institute) {
    throw new ApiError(404, "Institute not found");
  }

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "ACTIVATE_INSTITUTE",
    entityType: "institute",
    entityId: institute._id,
    description: `${req.user.name} activated institute ${institute.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, institute, "Institute activated successfully")
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/institutes/:id
// @access  Root, Admin
// @desc    Soft delete an institute
// ─────────────────────────────────────────
const deleteInstitute = asyncHandler(async (req, res) => {
  const institute = await Institute.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId, isDeleted: false },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id,
        isActive: false,
      },
    },
    { new: true }
  );

  if (!institute) {
    throw new ApiError(404, "Institute not found");
  }

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_INSTITUTE",
    entityType: "institute",
    entityId: institute._id,
    description: `${req.user.name} deleted institute ${institute.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, null, "Institute deleted successfully")
  );
});

// ═════════════════════════════════════════
// CONTACT PERSON MANAGEMENT
// ═════════════════════════════════════════

// ─────────────────────────────────────────
// @route   POST /api/institutes/:id/contacts
// @access  Root, Admin
// @desc    Add a contact person to an institute
// ─────────────────────────────────────────
const addContact = asyncHandler(async (req, res) => {
  const { name, mobile, email, role } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, "Contact name is required");
  }

  const institute = await Institute.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!institute) {
    throw new ApiError(404, "Institute not found");
  }

  const newContact = {
    name: name.trim(),
    mobile: mobile?.trim() || null,
    email: email?.toLowerCase().trim() || null,
    role: role?.trim() || null,
  };

  institute.contacts.push(newContact);
  await institute.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "ADD_INSTITUTE_CONTACT",
    entityType: "institute",
    entityId: institute._id,
    description: `${req.user.name} added contact ${newContact.name} to institute ${institute.name}`,
  });

  return res.status(201).json(
    new ApiResponse(201, institute, "Contact added successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/institutes/:id/contacts/:contactId
// @access  Root, Admin
// @desc    Update a contact person
// ─────────────────────────────────────────
const updateContact = asyncHandler(async (req, res) => {
  const { name, mobile, email, role } = req.body;
  const { id, contactId } = req.params;

  const institute = await Institute.findOne({
    _id: id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!institute) {
    throw new ApiError(404, "Institute not found");
  }

  const contact = institute.contacts.id(contactId);

  if (!contact) {
    throw new ApiError(404, "Contact not found");
  }

  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, "Contact name cannot be empty");
    contact.name = name.trim();
  }
  if (mobile !== undefined) contact.mobile = mobile?.trim() || null;
  if (email !== undefined) contact.email = email?.toLowerCase().trim() || null;
  if (role !== undefined) contact.role = role?.trim() || null;

  await institute.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_INSTITUTE_CONTACT",
    entityType: "institute",
    entityId: institute._id,
    description: `${req.user.name} updated contact ${contact.name} at institute ${institute.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, institute, "Contact updated successfully")
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/institutes/:id/contacts/:contactId
// @access  Root, Admin
// @desc    Remove a contact person from an institute
// ─────────────────────────────────────────
const deleteContact = asyncHandler(async (req, res) => {
  const { id, contactId } = req.params;

  const institute = await Institute.findOne({
    _id: id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!institute) {
    throw new ApiError(404, "Institute not found");
  }

  const contactIndex = institute.contacts.findIndex(
    (c) => c._id.toString() === contactId
  );

  if (contactIndex === -1) {
    throw new ApiError(404, "Contact not found");
  }

  const contactName = institute.contacts[contactIndex].name;
  institute.contacts.splice(contactIndex, 1);
  await institute.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_INSTITUTE_CONTACT",
    entityType: "institute",
    entityId: institute._id,
    description: `${req.user.name} removed contact ${contactName} from institute ${institute.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, institute, "Contact removed successfully")
  );
});

// ═════════════════════════════════════════
// COURSES OFFERED MANAGEMENT
// ═════════════════════════════════════════

// ─────────────────────────────────────────
// @route   POST /api/institutes/:id/courses
// @access  Root, Admin
// @desc    Add a course to an institute's offerings
// ─────────────────────────────────────────
const addCourseOffered = asyncHandler(async (req, res) => {
  const { courseId, fee, notes } = req.body;

  if (!courseId) {
    throw new ApiError(400, "courseId is required");
  }

  // Verify course exists in this tenant
  const course = await Course.findOne({
    _id: courseId,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  const institute = await Institute.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!institute) {
    throw new ApiError(404, "Institute not found");
  }

  // Check if course already added to this institute
  const alreadyAdded = institute.coursesOffered.find(
    (co) => co.courseId.toString() === courseId
  );

  if (alreadyAdded) {
    throw new ApiError(
      409,
      "This course is already listed for this institute"
    );
  }

  institute.coursesOffered.push({
    courseId,
    fee: fee ?? 0,
    notes: notes?.trim() || null,
    avgResultDays: 0,
  });

  await institute.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "ADD_INSTITUTE_COURSE",
    entityType: "institute",
    entityId: institute._id,
    description: `${req.user.name} added course ${course.name} to institute ${institute.name}`,
  });

  // Populate before returning
  await institute.populate("coursesOffered.courseId", "name shortCode");

  return res.status(201).json(
    new ApiResponse(201, institute, "Course added to institute successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/institutes/:id/courses/:courseOfferedId
// @access  Root, Admin
// @desc    Update fee or notes for a course offered
//          avgResultDays is never updated manually —
//          it is calculated automatically
// ─────────────────────────────────────────
const updateCourseOffered = asyncHandler(async (req, res) => {
  const { fee, notes } = req.body;
  const { id, courseOfferedId } = req.params;

  const institute = await Institute.findOne({
    _id: id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!institute) {
    throw new ApiError(404, "Institute not found");
  }

  const courseOffered = institute.coursesOffered.id(courseOfferedId);

  if (!courseOffered) {
    throw new ApiError(404, "Course offered entry not found");
  }

  if (fee !== undefined) courseOffered.fee = fee;
  if (notes !== undefined) courseOffered.notes = notes?.trim() || null;

  await institute.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_INSTITUTE_COURSE",
    entityType: "institute",
    entityId: institute._id,
    description: `${req.user.name} updated course offering at institute ${institute.name}`,
  });

  await institute.populate("coursesOffered.courseId", "name shortCode");

  return res.status(200).json(
    new ApiResponse(200, institute, "Course offering updated successfully")
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/institutes/:id/courses/:courseOfferedId
// @access  Root, Admin
// @desc    Remove a course from institute's offerings
// ─────────────────────────────────────────
const deleteCourseOffered = asyncHandler(async (req, res) => {
  const { id, courseOfferedId } = req.params;

  const institute = await Institute.findOne({
    _id: id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!institute) {
    throw new ApiError(404, "Institute not found");
  }

  const courseOfferedIndex = institute.coursesOffered.findIndex(
    (co) => co._id.toString() === courseOfferedId
  );

  if (courseOfferedIndex === -1) {
    throw new ApiError(404, "Course offered entry not found");
  }

  institute.coursesOffered.splice(courseOfferedIndex, 1);
  await institute.save();

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_INSTITUTE_COURSE",
    entityType: "institute",
    entityId: institute._id,
    description: `${req.user.name} removed a course offering from institute ${institute.name}`,
  });

  return res.status(200).json(
    new ApiResponse(200, institute, "Course offering removed successfully")
  );
});

export {
  createInstitute,
  getInstitutes,
  getInstituteById,
  updateInstitute,
  deactivateInstitute,
  activateInstitute,
  deleteInstitute,
  addContact,
  updateContact,
  deleteContact,
  addCourseOffered,
  updateCourseOffered,
  deleteCourseOffered,
};