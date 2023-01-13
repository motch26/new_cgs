const express = require("express");
const multer = require("multer");
const fs = require("fs/promises");
const upload = multer({ dest: "./tmp/" });
const router = express.Router();
const conn = require("../config/conn");
const ExcelJS = require("exceljs");

router.get("/login", (req, res) => {
  const { email } = req.query;
  conn.query(
    `SELECT faculty_id FROM emails WHERE email = '${email}'`,
    (err, data) => {
      res.status(200).json(data);
    }
  );
});

router.get("/getLoad", (req, res) => {
  const { faculty_id, school_year, semester, class_code } = req.query;
  conn.query(
    `SELECT c.class_code, 
            c.subject_code,
            CONCAT(s.program_code, ' ', s.yearlevel, ' - ', s.section_code) as section,
            COUNT(DISTINCT student_id) as noStudents
    FROM class c
    INNER JOIN section s USING (section_id)
    INNER JOIN student_load sl USING (class_code)
    WHERE faculty_id = '${faculty_id}' AND 
    school_year = ${school_year}  AND 
    semester = '${semester}'
     ${
       class_code ? `AND class_code = ${class_code}` : ""
     }  GROUP BY c.class_code ORDER BY section`,
    (err, data) => {
      if (err) {
        console.log(err.message);
        res.status(500).json(err.message);
      }
      res.status(200).json(data);
    }
  );
});
router.get("/getGradeTable", (req, res) => {
  const { class_code, semester, currentSchoolYear } = req.query;
  conn.query(
    `SELECT sg.student_grades_id as sg_id, s.student_id, CONCAT(s.student_lastname , ', ', s.student_firstname) as name, sg.mid_grade, sg.final_grade, sg.remarks as dbRemark
  FROM class c 
  INNER JOIN student_load sl
    USING (class_code) 
  INNER JOIN student s 
    USING (student_id)
  INNER JOIN student_grades sg
    USING (student_id)
  WHERE class_code = '${class_code}'AND 
  sg.school_year = '${currentSchoolYear}' AND 
  sg.semester = '${semester}' 
  GROUP BY name
  ORDER BY name`,
    (err, data) => {
      res.status(200).json(data);
    }
  );
});

router.get("/getExcelFile", (req, res) => {
  const { class_code, semester, currentSchoolYear } = req.query;
  const getClassInfo = async () => {};
  conn.query(
    `SELECT sg.student_grades_id, s.student_id, CONCAT(s.student_lastname , ', ', s.student_firstname) as name, sg.mid_grade, sg.final_grade, sg.remarks
  FROM class c 
  INNER JOIN student_load sl
    USING (class_code) 
  INNER JOIN student s 
    USING (student_id)
  INNER JOIN student_grades sg
    USING (student_id)
  WHERE class_code = '${class_code}'AND 
  sg.school_year = '${currentSchoolYear}' AND 
  sg.semester = '${semester}' 
  GROUP BY name
  ORDER BY name`,
    async (err, data) => {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "CHMSU Grading System";
      workbook.created = new Date();
      workbook.calcProperties.fullCalcOnLoad = true;

      const sheet = workbook.addWorksheet(class_code);

      //HEADER
      sheet.mergeCells("A1", "H1");
      const nameofSchool = sheet.getCell("A1");
      nameofSchool.value = "CARLOS HILADO MEMORIAL STATE UNIVERSITY";
      nameofSchool.alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      nameofSchool.font = {
        size: 12,
        bold: true,
      };

      let semesterWord = "";
      switch (semester) {
        case "1st":
          semesterWord = "1st Semester";
          break;
        case "2nd":
          semesterWord = "2nd Semester";
          break;
        case "summer":
          semesterWord = "Summer";
          break;
        default:
          break;
      }
      sheet.mergeCells("A2", "H2");
      const classInfo = sheet.getCell("A2");
      classInfo.value = `${semesterWord}, A.Y. ${currentSchoolYear} - ${
        parseInt(currentSchoolYear) + 1
      }`;
      classInfo.alignment = {
        vertical: "middle",
        horizontal: "center",
      };

      sheet.getRow(5).values = [
        "Grade ID",
        "Student ID",
        "Name",
        "Midterm",
        "Endterm",
        "Average",
        "Status",
        "Remark",
      ];
      sheet.getRow(5).font = {
        bold: true,
      };
      sheet.columns = [
        { key: "student_grades_id", width: 10 },
        { key: "student_id", width: 10 },
        { key: "name", width: 50 },
        { key: "mid_grade", width: 10 },
        { key: "final_grade", width: 10 },
        { key: "grade", width: 10 },
        { key: "status", width: 12 },
        { key: "remarks", width: 12 },
      ];

      data.forEach((item, i) => {
        const {
          student_grades_id,
          student_id,
          name,
          mid_grade,
          final_grade,
          remarks,
        } = item;
        const currentRow = i + 6;
        const row = sheet.getRow(currentRow);

        let remark = null;
        let status = null;
        switch (remarks) {
          case "passed":
            status = "Passed";
            break;
          case "failed":
            status = "Failed";
            break;
          case "inc":
            remark = "Incomplete";
            break;
          case "drp":
            remark = "Dropped";
            break;
          case "ng":
            remark = "No Grade";
            break;
          case "na":
            remark = "No Attendance";
            break;
          default:
            break;
        }
        row.values = {
          student_grades_id,
          student_id,
          name,
          mid_grade,
          final_grade,
          status,
          remarks: remark,
        };
        sheet.getCell(`F${currentRow}`).value = {
          formula: `IF(COUNTIF(D${currentRow}:E${currentRow}, "<>0") > 1, ROUND(AVERAGE(D${currentRow}:E${currentRow}), 0), "")`,
          result: Math.round(
            (parseInt(item.mid_grade) + parseInt(item.final_grade)) / 2
          ),
        };
        sheet.getCell(`G${currentRow}`).value = {
          formula: `IF(COUNTIF(D${currentRow}:E${currentRow}, "<>0") > 1, IF(AVERAGE(D${currentRow}:E${currentRow}) > 75, "Passed", "Failed"), "")`,
          result: status,
        };
        sheet.getCell(`H${currentRow}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: ['"Incomplete, Dropped, No Attendance"'],
        };
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=" + "File.xlsx"
      );
      workbook.xlsx.write(res).then(() => res.end());
    }
  );
});

router.post("/updateGrade", async (req, res) => {
  const countAffectedRows = (grade) => {
    const { sg_id, mid_grade, final_grade, dbRemark, average, status } = grade;
    return new Promise((resolve, reject) => {
      conn.query(
        "UPDATE student_grades SET mid_grade = ?, final_grade = ?, remarks = ?, grade = ? WHERE student_grades_id = ? ",
        [
          mid_grade,
          final_grade,
          dbRemark || status.toLowerCase(),
          average,
          sg_id,
        ],
        (err, results, fields) => {
          if (err) reject(err);
          resolve(results.affectedRows);
        }
      );
    });
  };

  const { grades } = req.body;

  try {
    const affectedRowsArr = await Promise.all(
      grades.map(async (grade) => await countAffectedRows(grade))
    );

    const totalAffectedRows = affectedRowsArr.reduce(
      (prev, current) => prev + current,
      0
    );
    conn.query("");

    res.status(200).json(totalAffectedRows);
  } catch (error) {
    if (error) console.log(error);
    res.status(500).json(error.message);
  }
});

router.post(
  "/uploadGradeSheet",
  upload.single("uploadFile"),
  async (req, res) => {
    const uploadFile = req.file;
    const { class_code } = req.body;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(uploadFile.path);

    const sheet = workbook.worksheets[0];

    const extractRowData = (row) => {
      return [
        row.values[1],
        row.values[4],
        row.values[5],
        row.getCell(6).result,
        row.getCell(7).result,
        row.values[8],
      ];
    };

    const processRow = (rowData, finalRemark) => {
      return new Promise((resolve, reject) => {
        conn.query(
          "UPDATE student_grades SET mid_grade = ?, final_grade = ?, grade = ?, remarks = ? WHERE student_grades_id = ?",
          [rowData[1], rowData[2], rowData[3], finalRemark, rowData[0]],
          (err, results, fields) => {
            if (err) {
              console.log(err.message);
              reject(err);
            }
            resolve(results.changedRows);
          }
        );
      });
    };

    sheet.eachRow({ includeEmpty: true }, async (row, rowNumber) => {
      if (rowNumber > 5) {
        const rowData = extractRowData(row);
        let finalRemark = "";
        if (rowData[4]) finalRemark = rowData[4].toLowerCase();
        else {
          switch (rowData[5]) {
            case "Incomplete":
              finalRemark = "inc";
              break;
            case "Dropped":
              finalRemark = "drp";
              break;
            case "No Attendance":
              finalRemark = "na";
              break;
            default:
              break;
          }
        }
        try {
          await processRow(rowData, finalRemark);
        } catch (error) {
          res.status(500).send(error.message);
        }
      }
    });
    await fs.unlink(uploadFile.path);

    res.status(200).json(1);
  }
);
module.exports = router;
