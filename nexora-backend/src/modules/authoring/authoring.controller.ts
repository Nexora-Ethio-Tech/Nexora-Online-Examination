import {
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Res,
  Query,
  Param,
  Body,
  Headers,
  HttpCode,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Roles } from '../../common/guards/roles.guard';
import { AuthoringService } from './authoring.service';

@Controller()
@Roles('teacher')
export class AuthoringController {
  constructor(private readonly authoring: AuthoringService) {}
  @Get('me/teaching-assignments')
  assignments(@Req() req: Request, @Query() query: unknown) {
    return this.authoring.assignments(req, query);
  }
  @Get('exams')
  list(@Req() req: Request, @Query() query: unknown) {
    return this.authoring.list(req, query);
  }
  @Get('exams/:id')
  read(@Req() req: Request, @Param('id') id: string) {
    return this.authoring.read(req, id);
  }
  @Get('exams/:id/items')
  items(@Req() req: Request, @Param('id') id: string) {
    return this.authoring.read(req, id, true);
  }
  @Post('exams')
  @HttpCode(200)
  async create(
    @Req() req: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    let created = false;
    const data = await this.authoring.save(req, undefined, body, key, () => {
      created = true;
    });
    res.status(created ? 201 : 200);
    return data;
  }
  @Patch('exams/:id')
  edit(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.authoring.save(req, id, body, key);
  }
  @Patch('exams/:id/items')
  editItem(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.authoring.saveItem(req, id, body, key);
  }
  @Post('exams/:id/submit-for-approval')
  @HttpCode(200)
  submit(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.authoring.submit(req, id, body, key);
  }
  @Post('exams/:id/review-all')
  @HttpCode(200)
  reviewAll(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.authoring.reviewAll(req, id, body, key);
  }
  @Post('exams/:id/remove')
  @HttpCode(200)
  remove(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.authoring.removeDraft(req, id, body, key);
  }
}
