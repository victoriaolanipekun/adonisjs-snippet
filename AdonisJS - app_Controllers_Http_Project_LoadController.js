'use strict'

const Project = use('App/Models/Project')
const Milestone = use('App/Models/Milestone')
const Task = use('App/Models/Task')
const Response = use('App/Models/Response')
const Lead = use('App/Models/Lead')
const Mail = use('Mail')
const User = use('App/Models/User')
const Invite = use('App/Models/Invite')
const Encryption = use('Encryption')
const Env = use('Env')
const Pro = use('App/Models/Pro')

class LoadController {
	async getAll({ request, response }){
		try {
			//select projects from the DB
			const projects = await Project.query().where({active: true, isDeleted: false}).orderBy('id', 'desc').get()

			//send success message
			return response.json({
				data: projects,
				message: 'Projects successfully retrieved',
				error: false,
			})
		} catch (e) {
			return response.json({
				data: [],
				message: e.message,
				error: true
			})
		}
	}

	async getOne({ request, response }){
		try {
			//get the project
			
			let project = await Project.query().where({ ...request.all(), isDeleted: false }).first()
			
			const { id } = project
			//get the talents for the project
			const talents = await Response.query().where({ projectId: id, isDeleted: false, approved: true, status: 'involved' }).get()

			for (let talent of talents){
				console.log(talent)
				const pro = await Pro.query().where({ userId: talent.talentId, active: true }).first()
				talent.data = pro
			}

			// get the milestones under the project
			let milestones = await Milestone.query().where({ projectId: id, isDeleted: false }).get()

			//get the tasks and talents under each milestone
			for (let i = 0; i < milestones.length; i++){
				let tasks = await Task.query().where({ projectId: id, isDeleted: false, milestoneId: milestones[i].id }).get()
				milestones[i].tasks = tasks

				let pros = await Response.query().where({ projectId: id, accepted: true, isDeleted: false }).get()
				let proArr = []
				// console.log(pros)
				
				for (let pro of pros){
					if (pro.milestones.includes(milestones[i].id)){
						const accPro = await Pro.query().where({ userId: pro.talentId }).first()
						proArr.push(accPro)
					}
				}
				milestones[i].talents = proArr

				if (milestones[i].talentId){
					const assTalent = await Pro.query().where({ userId: milestones[i].talentId }).first()

					milestones[i].talent = assTalent
				}
			}
			
			project.milestones = milestones;
			project.talents = talents			

			return response.json({
				data: project,
				message: 'Project successfully retrieved',
				error: false
			})
		} catch (e) {
			return response.json({
				data: [],
				message: e.message,
				error: true
			})
		}
	}

	async getOneWithHash({ request, response }){
		try {
			const params = request.all()
			console.log(params)
			//get the project
			let { id } = params

			id = Encryption.decrypt(id.replace(new RegExp(' ', 'g'), '+'))
			console.log(id)

			let project = await Project.query().where({ id, isDeleted: false }).first()

			// get the milestones under the project
			let milestones = await Milestone.query().where({ projectId: id, isDeleted: false }).get()

			//get the tasks under each milestone
			for (let i = 0; i < milestones.length; i++) {
				let tasks = await Task.query().where({ projectId: id, isDeleted: false, milestoneId: milestones[i].id }).get()
				milestones[i].tasks = tasks
			}

			project.milestones = milestones;

			return response.json({
				data: project,
				message: 'Project successfully retrieved',
				error: false
			})
		} catch (e) {
			return response.json({
				data: [],
				message: e.message,
				error: true
			})
		}
	}

	async update({ request, response }){
		try {
			const { id } = request.all();
			const params = request.except('id')

			const updateProject = await Project.query().where({ id }).update({ ...params })

			if (updateProject){
				return response.json({
					data: updateProject,
					message: 'Project Updated',
					error: false
				})
			} else {
				return response.json({
					data: [],
					message: 'Project couldn\'t be updated',
					error: true
				})
			}
		} catch (e){
			return response.json({
				data: [],
				message: e.message,
				error: true
			})
		}
	}

	async create({ request, response }){
		try {
			//get all the request params
			const params = await request.except(['email']);
			let email = await request.only(['email'])
			email = email.email
			//now store the record in the DB
			const createLead = await Project.create(params)

			if (createLead) {
				// send success message if saved successfully
				const lead = await Lead.query().where({ id: params.leadId }).update({ status: 'in-progress' })

				const user = await User.query().where({ email, isDeleted: false })

				if (user){
					// console.log(createLead)
					await Mail.send('emails.start', { ...createLead.toJSON() }, message => {
						message
							.to(email)
							.from(Env.get('MAIL_FROM'))
							.subject('Project Started')
					})

					return response.json({
						data: createLead,
						message: 'Project successfully created',
						error: false,
					})
				} else {
					const invite = await Invite.create({ email })

					if (invite){
						await Mail.send('emails.invite', { linkId: Encryption.encrypt(params.email) }, message => {
							message
								.to(params.email)
								.from(Env.get('MAIL_FROM'))
								.subject('Invitation to Horus')
						})

						return response.json({
							data: createLead,
							message: 'Project successfully created',
							error: false,
						})
					}
				}
			} else {
				return response.json({
					data: params,
					message: 'Unable to create project',
					error: true,
				})
			}
		} catch(e){
			return response.json({
				data: [],
				message: e.message,
				error: true
			})
		}
	}

	async addMilestone({ request, response }){
		try {
			const params = await request.except('tasks')
			const addMilestone = await Milestone.create(params)

			if (addMilestone) {
				const milestoneId = addMilestone.id;
				const taskList = request.input('tasks');

				let saved = false;
				let tasks = []
				for (let task of taskList){
					let param = { milestoneId, title: task, projectId: params.projectId }
					const addTasks = await Task.create(param)

					if (addTasks){
						saved = true
						tasks.push(addTasks);
					} else saved = false
				}

				if (saved){
					addMilestone.tasks = tasks
					return response.json({
						data: addMilestone,
						message: 'Milestone created successfully',
						error: false
					})
				} else {
					return response.json({
						data: [],
						message: 'Unable to create milestone',
						error: true,
					})
				}
			} else {
				return response.json({
					data: [],
					message: 'Unable to create milestone',
					error: true,
				})
			}
		} catch (e){
			return response.json({
				data: [],
				message: e.message,
				error: true
			})
		}
	}

	async getMilestone({ request, response }){
		try {
			// get the milestones under the project
			let milestones = await Milestone.query().where({ ...request.all(), isDeleted: false }).first()

			let tasks = await Task.query().where({ projectId: milestones.projectId, isDeleted: false, milestoneId: milestones.id }).get()
			milestones.tasks = tasks

			return response.json({
				data: milestones,
				message: 'Milestone successfully retrieved',
				error: false
			})
		} catch (e) {
			return response.json({
				data: [],
				message: e.message,
				error: true
			})
		}
	}

	async getMilestones({ request, response }){
		try {
			// get the milestones under the project
			let milestones = await Milestone.query().where({ ...request.all(), isDeleted: false }).get()

			//get the tasks under each milestone
			for (let i = 0; i < milestones.length; i++) {
				let tasks = await Task.query().where({ projectId: milestones[i].projectId, isDeleted: false, milestoneId: milestones[i].id }).get()
				milestones[i].tasks = tasks
			}

			return response.json({
				data: milestones,
				message: 'Milestones successfully retrieved',
				error: false
			})
		} catch (e) {
			return response.json({
				data: [],
				message: e.message,
				error: true
			})
		}
	}

	async deleteMilestone({ request, response }){
		try {
			const deleteMilestone = await Milestone.query().where({ ...request.all() }).update({ isDeleted: true })

			if (deleteMilestone){
				const { id } = request.all()
				const deleteTask = await Task.query().where({ milestoneId: id }).update({ isDeleted: true })

				return response.json({
					data: [],
					message: 'Milestone deleted successfully',
					eror: false
				})
			} else {
				return response.json({
					data: [],
					message: 'Milestone couldn\'t be deleted',
					error: true
				})
			}
		} catch (e) {
			return response.json({
				data: [],
				message: e.message,
				error: true
			})
		}
	}

	async updateMilestone({ request, response }){
		try {
			const { id } = request.all();
			const params = request.except('id')
			const updateMilestone = await Milestone.query().where({ id }).update({ ...params })

			if (updateMilestone){
				return response.json({
					data: updateMilestone,
					message: 'Milestone Updated',
					error: false
				})
			} else {
				return response.json({
					data: [],
					message: 'Milestone couldn\'t ne updated',
					error: true
				})
			}
		} catch (e) {
			return response.json({
				data: [],
				message: e.message,
				error: false
			})
		}
	}

	async updateTask({ request, response }){
		try {
			const { id } = request.all();
			const params = request.except('id');
			const updateTask = await Task.query().where({ id }).update({ ...params })

			if (updateTask){
				return response.json({
					data: updateTask,
					message: 'Task Updated',
					error: false
				})
			} else {
				return response.json({
					data: [],
					message: 'Task couldn\'t be updated',
					error: true
				})
			}
		} catch (e){
			return response.json({
				data: [],
				message: e.message,
				error: false
			})
		}
	}

	async deleteTask({ request, response }) {
		try {
			const deleteTask = await Task.query().where({ ...request.all() }).update({ isDeleted: true })

			if (deleteTask) {
				return response.json({
					data: [],
					message: 'Task Deleted',
					error: false
				})
			} else {
				return response.json({
					data: [],
					message: 'Task couldn\'t be deleted',
					error: true
				})
			}
		} catch (e) {
			return response.json({
				data: [],
				message: e.message,
				error: false
			})
		}
	}

	async searchTalent({ request, response }){
		try {
			const talents = await Pro.query().where({ active: true, approved: true }).get()
			const params = request.all()
			const { skills } = params

			for (let talent of talents){
				if (!talent.tools){
					talent.score = 0
				} else {
					let tools = talent.tools.replace(new RegExp(' ', 'g'), '').split(',')
					let score = 0;
					tools.forEach(tool => {
						skills.forEach(skill => {
							if (skill.toLowerCase() === tool.toLowerCase()) score++
						})
					})
					talent.searchScore = score
				}
			}

			let filtered = talents.filter((talent) => talent.searchScore > 0)

			return response.json({
				data: filtered.sort((a, b) => b.searchScore > a.searchScore),
				message: 'Talents fetched',
				error: false
			})
		} catch(e){
			return response.json({
				data: [],
				message: e.message,
				error: true
			})
		}
	}
}

module.exports = LoadController
