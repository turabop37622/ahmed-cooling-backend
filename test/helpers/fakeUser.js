// A tiny in-memory stand-in for the User model so auth flows can be tested without a database.
const bcrypt = require('bcryptjs');

let counter = 0;
const matches = (doc, filter) =>
  Object.entries(filter).every(([key, cond]) => {
    if (cond && typeof cond === 'object' && '$in' in cond) return cond.$in.includes(doc[key]);
    if (cond && typeof cond === 'object' && '$ne' in cond) return doc[key] !== cond.$ne;
    return String(doc[key]) === String(cond);
  });

class FakeUser {
  constructor(data = {}) {
    Object.assign(this, { role: 'customer', isVerified: false, isPhoneVerified: false, authProvider: 'local', otpAttempts: 0 }, data);
    this._id = data._id || String(++counter).padStart(24, '0');
  }

  async save() {
    if (this.password && !String(this.password).startsWith('$2')) {
      if (FakeUser.store.includes(this)) this.passwordChangedAt = new Date();
      this.password = bcrypt.hashSync(this.password, 4);
    }
    if (!FakeUser.store.includes(this)) FakeUser.store.push(this);
    return this;
  }

  async comparePassword(pw) {
    return !!this.password && bcrypt.compare(pw, this.password);
  }

  static async findOne(filter) {
    return FakeUser.store.find((doc) => matches(doc, filter)) || null;
  }

  // Only what utils/otp.js needs: an atomic $inc guarded by the filter.
  static async findOneAndUpdate(filter, update) {
    const doc = FakeUser.store.find((d) => String(d._id) === String(filter._id));
    if (!doc) return null;
    const limit = filter.$or?.[0]?.otpAttempts?.$lt;
    const current = doc.otpAttempts;
    if (current !== undefined && limit !== undefined && !(current < limit)) return null;
    doc.otpAttempts = (current || 0) + update.$inc.otpAttempts;
    return doc;
  }

  static async deleteOne(filter) {
    FakeUser.store = FakeUser.store.filter((doc) => !matches(doc, filter));
  }

  static findById(id) {
    const user = FakeUser.store.find((doc) => String(doc._id) === String(id)) || null;
    return { select: async () => user, then: (resolve, reject) => Promise.resolve(user).then(resolve, reject) };
  }
}
FakeUser.store = [];

module.exports = FakeUser;
