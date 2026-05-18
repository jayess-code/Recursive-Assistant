import { Query } from "mongoose";

interface QueryString {
  page?: string;
  sort?: string;
  limit?: string;
  fields?: string;
  [key: string]: any;
}

class APIFeatures<T> {
  query: Query<T[], T>;
  queryString: QueryString;

  constructor(query: Query<T[], T>, queryString: QueryString) {
    this.query = query;
    this.queryString = queryString;
  }

  filter(): this {
    // BUILD QUERY
    const queryObj = { ...this.queryString };
    const excludedFields = ["page", "sort", "limit", "fields"];
    excludedFields.forEach((el) => delete queryObj[el]);

    // ADVANCE FILTERING QUERY
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);
    this.query = this.query.find(JSON.parse(queryStr));
    return this;
  }

  sort(): this {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(",").join(" ");
      console.log(sortBy);
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort("-createdAt");
    }
    return this;
  }

  limitFields(): this {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(",").join(" ");
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select("-__v");
    }
    return this;
  }

  //   paginate(): this {
  //     if (this.queryString.cursor) {
  //       this.query = this.query.find({
  //         createdAt: { $lt: new Date(this.queryString.cursor) }
  //       });
  //       this.query = this.query.sort({ createdAt: -1 }).limit(
  //         this.queryString.limit ? parseInt(this.queryString.limit, 10) : 30
  //       );
  //     } else {
  //       // fallback to page/limit
  //       const page = this.queryString.page
  //         ? parseInt(this.queryString.page, 10)
  //         : 1;
  //       const limit = this.queryString.limit
  //         ? parseInt(this.queryString.limit, 10)
  //         : 30;
  //       const skip = (page - 1) * limit;
  //       this.query = this.query.sort({ createdAt: -1 }).skip(skip).limit(limit);
  //     }

  //     return this;
  //   }
  // }

  paginate(): this {
    const page = this.queryString.page
      ? parseInt(this.queryString.page, 10)
      : 1;

    const MAX_LIMIT = 150;
    const limit = this.queryString.limit
      ? parseInt(this.queryString.limit, 10)
      : MAX_LIMIT;
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);

    return this;
  }
}

export default APIFeatures;

