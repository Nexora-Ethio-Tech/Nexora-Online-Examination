import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Headers,
  HttpCode,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { Roles } from '../../common/guards/roles.guard';
import { DirectoryService } from './directory.service';
import { RosterService } from './roster.service';
@Controller()
@Roles('school_admin')
export class DirectoryController {
  constructor(
    private readonly directory: DirectoryService,
    private readonly roster: RosterService,
  ) {}
  @Post('directory/:kind/:id/remove')
  @HttpCode(200)
  remove(
    @Req() req: Request,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.directory.remove(req, kind, id, body, key);
  }
  @Get('classes')
  classes(@Req() req: Request, @Query() query: unknown) {
    return this.directory.list(req, 'classes', query);
  }
  @Get('subjects')
  subjects(@Req() req: Request, @Query() query: unknown) {
    return this.directory.list(req, 'subjects', query);
  }
  @Get('students')
  students(@Req() req: Request, @Query() query: unknown) {
    return this.directory.list(req, 'students', query);
  }
  @Get('teachers')
  teachers(@Req() req: Request, @Query() query: unknown) {
    return this.directory.list(req, 'teachers', query);
  }
  @Get('teacher-assignments')
  teacher_assignments(@Req() req: Request, @Query() query: unknown) {
    return this.directory.list(req, 'teacher-assignments', query);
  }
  @Get('admin/directory-audit')
  audit(@Req() req: Request, @Query() query: unknown) {
    return this.directory.list(req, 'audit', query);
  }
  @Post('classes')
  @HttpCode(200)
  classes_create(
    @Req() req: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.directory.saveEntity(req, 'classes', undefined, body, key);
  }
  @Patch('classes/:id')
  @HttpCode(200)
  classes_edit(
    @Req() req: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
    @Param('id') id: string,
  ) {
    return this.directory.saveEntity(req, 'classes', id, body, key);
  }
  @Post('subjects')
  @HttpCode(200)
  subjects_create(
    @Req() req: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.directory.saveEntity(req, 'subjects', undefined, body, key);
  }
  @Patch('subjects/:id')
  @HttpCode(200)
  subjects_edit(
    @Req() req: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
    @Param('id') id: string,
  ) {
    return this.directory.saveEntity(req, 'subjects', id, body, key);
  }
  @Patch('students/:id')
  edit_student(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.directory.editAccount(req, 'student', id, body, key);
  }
  @Post('students/:id/reset-password')
  @HttpCode(200)
  reset_student(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.directory.credentials(req, 'student', id, body, key);
  }
  @Patch('teachers/:id')
  edit_teacher(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.directory.editAccount(req, 'teacher', id, body, key);
  }
  @Post('teachers/:id/reset-password')
  @HttpCode(200)
  reset_teacher(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.directory.credentials(req, 'teacher', id, body, key);
  }
  @Post('teachers')
  @HttpCode(200)
  createTeacher(
    @Req() req: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.directory.credentials(req, 'teacher', undefined, body, key, true);
  }
  @Post('students/generate-credentials')
  @HttpCode(200)
  generate(@Req() req: Request, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    return this.directory.credentials(req, 'student', undefined, body, key);
  }
  @Post('teacher-assignments')
  @HttpCode(200)
  assign(@Req() req: Request, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    return this.directory.assignment(req, undefined, body, key);
  }
  @Patch('teacher-assignments/:id')
  editAssignment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.directory.assignment(req, id, body, key);
  }
  @Post('students/import')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2097152, files: 1, fields: 1, parts: 3 } }),
  )
  preview(
    @Req() req: Request,
    @Body() body: unknown,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.roster.preview(req, body, file, key);
  }
  @Post('students/import/:id/commit')
  @HttpCode(200)
  commit(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.roster.commit(req, id, body, key);
  }
}
