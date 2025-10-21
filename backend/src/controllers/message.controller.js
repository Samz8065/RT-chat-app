import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getRecieverSocketId, io } from "../lib/socket.js";
import crypto from "crypto";

// Encryption utilities
const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY = process.env.MESSAGE_ENCRYPTION_KEY;

const encrypt = (text) => {
  if (!text) return null;

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Return IV + authTag + encrypted data (all in hex)
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
};

const decrypt = (encryptedText) => {
  if (!encryptedText) return null;

  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

export const getUserForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({
      _id: { $ne: loggedInUserId },
    }).select("-password");
    res.status(200).json(filteredUsers);
  } catch (error) {
    console.log("error in getUserForSidebar: ", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;
    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    })
      .populate("senderId", "firstName lastName profilePic")
      .sort({ createdAt: 1 });

    // Decrypt messages before sending to client
    const decryptedMessages = messages.map((msg) => ({
      ...msg.toObject(),
      text: msg.text ? decrypt(msg.text) : null,
    }));

    res.status(200).json(decryptedMessages);
  } catch (error) {
    console.log("error in getMessages Controller: ", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if (!text && !image) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image, {
        folder: "messages",
        resource_type: "image",
        transformation: [{ width: 800, height: 800, crop: "limit" }],
      });
      imageUrl = uploadResponse.secure_url;
    }

    // Encrypt the message text before saving
    const encryptedText = text ? encrypt(text) : null;

    const newMessage = new Message({
      senderId,
      receiverId,
      text: encryptedText,
      image: imageUrl,
    });

    await newMessage.save();

    // optional: populate sender for frontend
    await newMessage.populate("senderId", "firstName lastName profilePic");

    // Decrypt for socket emission
    const messageToSend = {
      ...newMessage.toObject(),
      text: newMessage.text ? decrypt(newMessage.text) : null, // Send original unencrypted text via socket
    };

    const recieverSocketId = getRecieverSocketId(receiverId);
    if (recieverSocketId) {
      io.to(recieverSocketId).emit("newMessage", messageToSend);
    }

    res.status(201).json(messageToSend);
  } catch (error) {
    console.error("error in sendMessage controller:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
