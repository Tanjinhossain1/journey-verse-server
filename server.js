const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Sequelize, DataTypes } = require("sequelize");
const cors = require("cors");

// Initialize Express and Middleware
const app = express();
app.use(express.json());
app.use(cors());

// Initialize Server and Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for development
    methods: ["GET", "POST"]
  }
});

// Connect to PostgreSQL (using Railway Database URL)
const sequelize = new Sequelize("postgresql://postgres:hXUbuHRFHiOThwWAVzWQMuigpfUxzjNj@autorack.proxy.rlwy.net:50134/railway", {
  dialect: "postgres",
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

// Define Message Model
const Message = sequelize.define("Messages", {
  id: {
    type: DataTypes.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true
  },
  sender: { type: DataTypes.STRING, allowNull: false },
  senderName: { type: DataTypes.STRING, allowNull: false },
  senderImage: { type: DataTypes.STRING },
  recipient: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  timestamp: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
}, {
  timestamps: true, // Adds createdAt and updatedAt fields
});

// Sync Database
sequelize.sync({ alter: true })
  .then(() => console.log("Database synced"))
  .catch((error) => console.error("Database sync failed:", error));

// Socket.IO Event Handlers
io.on("connection", (socket) => {
  console.log("New client connected");

  // Fetch Messages (with Pagination)
  socket.on("fetch_messages", async ({ recipient, sender, offset, limit }) => {
    try {
      let whereClause = { recipient };
      if (recipient !== "Live Review") {
        whereClause = {
          [Sequelize.Op.or]: [
            { sender, recipient },
            { sender: recipient, recipient: sender }
          ]
        };
      }
      const messages = await Message.findAll({
        where: whereClause,
        order: [["timestamp", "DESC"]],
        offset,
        limit,
      });
      socket.emit("messages_fetched", messages.reverse());
    } catch (error) {
      console.error("Error fetching messages:", error);
      socket.emit("error", { message: "Failed to fetch messages" });
    }
  });

  // Send New Message
  socket.on("send_message", async ({ sender, senderName, senderImage, recipient, message }) => {
    try {
      const newMessage = await Message.create({ sender, senderName, senderImage, recipient, message });
      io.emit("new_message", newMessage); // Broadcast to all clients
    } catch (error) {
      console.error("Error sending message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Delete a Message
  socket.on("delete_message", async ({ messageId }) => {
    try {
      const result = await Message.destroy({ where: { id: messageId } });
      if (result) {
        io.emit("message_deleted", { messageId }); // Notify all clients
      } else {
        socket.emit("error", { message: "Message not found" });
      }
    } catch (error) {
      console.error("Error deleting message:", error);
      socket.emit("error", { message: "Failed to delete message" });
    }
  });

  // Update a Message
  socket.on("update_message", async ({ messageId, newMessage }) => {
    try {
      const message = await Message.findByPk(messageId);
      if (message) {
        message.message = newMessage;
        await message.save();
        io.emit("message_updated", { messageId, newMessage }); // Notify all clients
      } else {
        socket.emit("error", { message: "Message not found" });
      }
    } catch (error) {
      console.error("Error updating message:", error);
      socket.emit("error", { message: "Failed to update message" });
    }
  });

  // Handle Disconnect
  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Start Server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

